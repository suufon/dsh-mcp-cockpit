/**
 * dsh-mcp-cockpit — 在一处管理本机全部 MCP 服务器。
 *
 * 每个 MCP 服务器都是 profile 里的一行 `@deepseek-ai/dsh-mcp-client` 插件，
 * 所以「管理 MCP」= 增删改这一族配置行，并让它们立刻生效。
 *
 * 写入路径（建行/删行/启停/改配置都走同一条）：
 *   改 profile 的 cordis.patch.yml，再 hmr.reconcileProfile() 立刻应用。
 *   整段读改写包在 hmr.runExclusive 里，避免和 HMR 自己的 watcher 交错；
 *   写前留一份 <patch>.bak-mcpcockpit，写时先 .tmp-<pid> 再 rename。
 *   （configEditor.edit 只会改已有行的 config，且在顶层追加覆盖行，
 *    同一个 id 会变成两份，所以这里不用它。）
 *
 * 读取路径：loader.entries() 拿全树（含 bundle 子 Include 里的行，取不到时
 * 回退 configEditor.entries()）+ pluginManager.listPlugins()（fiber 阶段）
 * + tools.schemas() 里 mcp__<server>__* 的工具数。状态只报观测到的事实。
 *
 * @module dsh-mcp-cockpit
 */

import { readFile, writeFile, rename, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const ROUTE = '/dsh-mcp-cockpit'
const GATE_HEADER = 'x-dsh-mcp-cockpit'
const MAX_BODY = 1024 * 1024
const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const CONFIG_KEYS = [
  'transport',
  'serverName',
  'command',
  'args',
  'cwd',
  'url',
  'env',
  'headers',
  'toolCallTimeoutMs',
  'failOnStartupError',
  'maxInstructionBytes',
]

export const name = 'dsh-mcp-cockpit'
export const inject = ['webServer']

function log(ctx, message) {
  try {
    ctx.logger?.info?.(`[mcp-cockpit] ${message}`)
  } catch {
    /* logging must never break an operation */
  }
}

//#region 传输层

function sendJson(res, status, payload) {
  try {
    if (res.writableEnded === true || res.destroyed === true) return
    let body = ''
    try {
      body = JSON.stringify(payload)
    } catch {
      body = '{"ok":false,"error":"unserializable"}'
    }
    if (res.headersSent === true) {
      res.end()
      return
    }
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    /* the socket is gone */
  }
}

function readJsonBody(req, limit = MAX_BODY) {
  return new Promise((resolve) => {
    let size = 0
    let done = false
    const parts = []
    const finish = (value) => {
      if (done === true) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      finish(null)
      try {
        req.destroy?.()
      } catch {
        /* already gone */
      }
    }, 10000)
    timer.unref?.()
    try {
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > limit) {
          finish(null)
          try {
            req.destroy?.()
          } catch {
            /* already gone */
          }
          return
        }
        parts.push(chunk)
      })
      req.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8').trim()
        if (text === '') return finish({})
        try {
          finish(JSON.parse(text))
        } catch {
          finish(undefined)
        }
      })
      req.on('error', () => finish(null))
    } catch {
      finish(null)
    }
  })
}

const LOOPBACK = /^(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?$/i

/** 只接受同源页面发来的、带标记头的本机请求。 */
function requestAllowed(req) {
  try {
    const gate = req?.headers?.[GATE_HEADER]
    if (typeof gate !== 'string' || gate === '') return false
    const host = typeof req?.headers?.host === 'string' ? req.headers.host.trim().toLowerCase() : ''
    if (host !== '' && LOOPBACK.test(host) === false) return false
    const origin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim().toLowerCase() : ''
    if (origin === 'null') return false
    if (origin !== '') {
      let site = ''
      try {
        site = new URL(origin).host.toLowerCase()
      } catch {
        return false
      }
      if (host !== '' && site !== host) return false
    }
    const fetchSite = typeof req?.headers?.['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'] : ''
    if (fetchSite !== '' && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
    return true
  } catch {
    return false
  }
}

//#endregion

//#region profile patch

function profileDirectory(ctx) {
  const profileContext = ctx.get('profileContext')
  const dir = profileContext?.dir
  if (typeof dir === 'string' && dir !== '') return dir
  const envDir = process.env.DSH_PROFILE_DIR
  if (typeof envDir === 'string' && envDir !== '') return envDir
  throw new Error('无法定位 profile 目录')
}

function patchPathOf(ctx) {
  const profileContext = ctx.get('profileContext')
  const declared = profileContext?.patchPath
  if (typeof declared === 'string' && declared !== '') return declared
  return join(profileDirectory(ctx), 'cordis.patch.yml')
}

const YAML_TAGS = [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }]

/**
 * yaml 解析器优先从 profile 的 node_modules 里找：插件本体可能是一个 link: 目录
 * （在工作区里），裸导入 'yaml' 会从工作区往上找而找不到。
 */
async function yamlModule(ctx) {
  try {
    const mod = await import('yaml')
    return mod.default ?? mod
  } catch {
    /* fall through to the profile copy */
  }
  let profileDir = ''
  try {
    profileDir = profileDirectory(ctx)
  } catch {
    profileDir = ''
  }
  if (profileDir !== '') {
    try {
      const require = createRequire(join(profileDir, 'package.json'))
      const resolved = require.resolve('yaml')
      const mod = await import(pathToFileURL(resolved).href)
      return mod.default ?? mod
    } catch (error) {
      throw new Error(`无法从 profile 加载 yaml 模块：${error?.message ?? error}`)
    }
  }
  throw new Error('无法加载 yaml 模块：profile 目录不可用')
}

/** 收集可承载行的序列：顶层行 + 每个 insert 块内部的行。 */
function rowContainers(document, YAML) {
  const containers = []
  const root = document.contents
  if (YAML.isSeq(root) === false) return containers
  containers.push({ seq: root, block: null })
  for (const item of root.items) {
    if (YAML.isMap(item) === false) continue
    const insert = item.get('insert')
    if (YAML.isSeq(insert)) containers.push({ seq: insert, block: item })
  }
  return containers
}

/**
 * 找出所有同 id 的行。同一个 id 可以同时出现在顶层和某个 insert 块里
 * （configEditor.edit 新建的覆盖行就落在顶层），所以这里一律返回全部。
 */
function findRows(document, YAML, rowId) {
  const found = []
  for (const container of rowContainers(document, YAML)) {
    for (const item of container.seq.items) {
      if (YAML.isMap(item) === false) continue
      if (item.get('id') !== rowId) continue
      found.push({ seq: container.seq, block: container.block, item })
    }
  }
  return found
}

function appendRow(document, YAML, row) {
  for (const container of rowContainers(document, YAML)) {
    if (container.block === null) continue
    container.seq.add(document.createNode(row))
    return
  }
  document.add({ insert: [document.createNode(row)] })
}

/**
 * 读改写 profile patch：整段放在 hmr 的独占区里，写完立刻按行 id 重放配置。
 * 重放失败不回滚文件（改动已经落盘），只把失败现象原样交给调用方。
 * @returns {Promise<{changed: boolean, file: string, warning?: string}>}
 */
async function editPatch(ctx, mutate) {
  const hmr = ctx.get('hmr')
  if (hmr === undefined || hmr === null) throw new Error('缺少 hmr 服务，无法热应用配置')
  const YAML = await yamlModule(ctx)
  const file = patchPathOf(ctx)
  return hmr.runExclusive(async () => {
    let text = ''
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      text = '[]\n'
    }
    const document = YAML.parseDocument(text, { customTags: YAML_TAGS })
    if (document.errors?.length > 0) throw new Error(`cordis.patch.yml 解析失败：${document.errors[0].message}`)
    if (YAML.isSeq(document.contents) === false) throw new Error('cordis.patch.yml 顶层不是序列，未做任何修改')
    const changed = mutate(document, YAML) !== false
    const next = String(document)
    if (changed === false || next === text) return { changed: false, file }
    try {
      await copyFile(file, `${file}.bak-mcpcockpit`)
    } catch {
      /* a fresh profile has nothing to back up */
    }
    const temporary = `${file}.tmp-${process.pid}`
    await writeFile(temporary, next, { mode: 0o600 })
    await rename(temporary, file)
    try {
      await hmr.reconcileProfile()
      return { changed: true, file }
    } catch (error) {
      return { changed: true, file, warning: String(error?.message ?? error) }
    }
  })
}

//#endregion

//#region 领域逻辑

function rowIdOf(entry) {
  const id = entry?.options?.id
  if (typeof id !== 'string' || id === '') return ''
  return id.startsWith('include:') ? id.slice('include:'.length) : id
}

function entryIdOf(entry) {
  return typeof entry?.id === 'string' && entry.id !== '' ? entry.id : `include:${rowIdOf(entry)}`
}

/**
 * 本机全部 MCP 行。
 *
 * 优先用 loader.entries()：它能拿到嵌在已安装 bundle 子组里的行
 * （例如 blender / photocraft 自带的 MCP 客户端），configEditor.entries()
 * 只覆盖 root Include 直属的行，会漏掉这些。configEditor 作为兜底。
 */
function mcpEntries(ctx) {
  const rows = []
  const seen = new Set()
  const push = (entry) => {
    if (entry?.options?.name !== MCP_PACKAGE) return
    const key = `${entryIdOf(entry)}|${rowIdOf(entry)}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(entry)
  }
  const loader = ctx.get('loader')
  if (loader !== undefined && loader !== null && typeof loader.entries === 'function') {
    try {
      for (const entry of loader.entries()) push(entry)
    } catch {
      /* fall through to configEditor */
    }
  }
  if (rows.length === 0) {
    const editor = ctx.get('configEditor')
    if (editor !== undefined && editor !== null && typeof editor.entries === 'function') {
      try {
        for (const entry of editor.entries() ?? []) push(entry)
      } catch {
        /* nothing to show */
      }
    }
  }
  return rows
}

async function pluginRows(ctx) {
  const manager = ctx.get('pluginManager')
  const map = new Map()
  if (manager === undefined || manager === null) return map
  try {
    const listed = await manager.listPlugins()
    for (const plugin of Array.isArray(listed) ? listed : []) {
      if (typeof plugin?.entryId !== 'string') continue
      map.set(plugin.entryId, plugin)
      if (typeof plugin.patchId === 'string' && plugin.patchId !== '') map.set(plugin.patchId, plugin)
    }
  } catch {
    /* the manager is optional: phases then read as unknown */
  }
  return map
}

function toolCounts(ctx) {
  const counts = new Map()
  const tools = ctx.get('tools')
  if (tools === undefined || tools === null || typeof tools.schemas !== 'function') return counts
  let schemas = []
  try {
    schemas = tools.schemas() ?? []
  } catch {
    return counts
  }
  for (const schema of schemas) {
    const toolName = typeof schema?.name === 'string' ? schema.name : ''
    if (toolName.startsWith('mcp__') === false) continue
    const rest = toolName.slice('mcp__'.length)
    const cut = rest.indexOf('__')
    if (cut <= 0) continue
    const server = rest.slice(0, cut)
    counts.set(server, (counts.get(server) ?? 0) + 1)
  }
  return counts
}

/** 只回传凭据的键名，值一律不出 Host。 */
function publicConfig(entry) {
  const raw = entry?.options?.config
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const view = {}
  for (const key of CONFIG_KEYS) {
    if (key === 'env' || key === 'headers') continue
    if (source[key] !== undefined) view[key] = source[key]
  }
  return view
}

async function listServers(ctx) {
  const entries = mcpEntries(ctx)
  const phases = await pluginRows(ctx)
  const counts = toolCounts(ctx)
  const servers = entries.map((entry) => {
    const rowId = rowIdOf(entry)
    const entryId = entryIdOf(entry)
    const config = publicConfig(entry)
    const info = phases.get(entryId) ?? phases.get(rowId) ?? null
    const serverName = typeof config.serverName === 'string' && config.serverName !== '' ? config.serverName : rowId
    const env = entry?.options?.config?.env
    const headers = entry?.options?.config?.headers
    return {
      rowId,
      entryId,
      serverName,
      transport: config.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? config.args.map((value) => String(value)) : [],
      cwd: typeof config.cwd === 'string' ? config.cwd : '',
      url: typeof config.url === 'string' ? config.url : '',
      envKeys: env !== null && typeof env === 'object' ? Object.keys(env) : [],
      headerKeys: headers !== null && typeof headers === 'object' ? Object.keys(headers) : [],
      toolCallTimeoutMs: typeof config.toolCallTimeoutMs === 'number' ? config.toolCallTimeoutMs : null,
      failOnStartupError: config.failOnStartupError === true,
      enabled: info?.enabled === undefined ? entry?.options?.disabled !== true : info.enabled !== false,
      phase: typeof info?.fiberPhase === 'string' ? info.fiberPhase : 'unknown',
      patchId: typeof info?.patchId === 'string' ? info.patchId : rowId,
      readonly: entry?.options?.readonly === true,
      tools: counts.get(serverName) ?? 0,
    }
  })
  servers.sort((left, right) => left.rowId.localeCompare(right.rowId))
  return servers
}

function normalizeInput(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const serverName = String(source.serverName ?? '').trim()
  if (NAME_PATTERN.test(serverName) === false) throw new Error('serverName 只能用字母、数字、下划线、短横线，长度 1-32')
  const transport = source.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
  const config = { serverName, transport }
  if (transport === 'stdio') {
    const command = String(source.command ?? '').trim()
    if (command === '') throw new Error('stdio 传输必须填 command')
    config.command = command
    config.args = Array.isArray(source.args) ? source.args.map((value) => String(value)) : []
    if (source.env !== null && typeof source.env === 'object' && Array.isArray(source.env) === false) {
      const env = {}
      for (const [key, value] of Object.entries(source.env)) {
        const label = String(key).trim()
        if (label !== '') env[label] = String(value ?? '')
      }
      if (Object.keys(env).length > 0) config.env = env
    }
    const cwd = String(source.cwd ?? '').trim()
    if (cwd !== '') config.cwd = cwd
  } else {
    const url = String(source.url ?? '').trim()
    if (/^https?:\/\//i.test(url) === false) throw new Error('streamable-http 传输必须填 http(s) 地址')
    config.url = url
    if (source.headers !== null && typeof source.headers === 'object' && Array.isArray(source.headers) === false) {
      const headers = {}
      for (const [key, value] of Object.entries(source.headers)) {
        const label = String(key).trim()
        if (label !== '') headers[label] = String(value ?? '')
      }
      if (Object.keys(headers).length > 0) config.headers = headers
    }
  }
  const timeout = Number(source.toolCallTimeoutMs)
  if (Number.isFinite(timeout) && timeout > 0) config.toolCallTimeoutMs = Math.round(timeout)
  if (source.failOnStartupError === true) config.failOnStartupError = true
  return config
}

async function addServer(ctx, input) {
  const config = normalizeInput(input)
  const rowId = `mcp-${config.serverName.toLowerCase()}`
  if (mcpEntries(ctx).some((entry) => rowIdOf(entry) === rowId)) throw new Error(`已存在同名服务器：${rowId}`)
  const written = await editPatch(ctx, (document, YAML) => {
    if (findRows(document, YAML, rowId).length > 0) throw new Error(`profile 里已有 id=${rowId} 的行`)
    appendRow(document, YAML, { id: rowId, name: MCP_PACKAGE, config })
    return true
  })
  log(ctx, `added ${rowId}`)
  return { rowId, changed: written.changed }
}

async function updateServer(ctx, input) {
  const rowId = String(input?.rowId ?? input?.id ?? '').trim()
  if (rowId === '') throw new Error('缺少 rowId')
  const entry = mcpEntries(ctx).find((candidate) => rowIdOf(candidate) === rowId)
  if (entry === undefined) throw new Error(`没有找到 MCP 行：${rowId}`)
  const patch = normalizeInput(input)
  const written = await editPatch(ctx, (document, YAML) => {
    const rows = findRows(document, YAML, rowId)
    if (rows.length === 0) {
      // 行是某个 bundle 声明的：补一条 profile 覆盖行，不改动别人的文件。
      document.add({ id: rowId, name: MCP_PACKAGE, config: patch })
      return true
    }
    const current = rows[rows.length - 1].item.get('config')
    const merged = { ...(YAML.isMap(current) ? current.toJSON() : (current ?? {})), ...patch }
    let touched = false
    for (const row of rows) {
      row.item.set('config', document.createNode(merged))
      row.item.set('name', MCP_PACKAGE)
      touched = true
    }
    return touched
  })
  log(ctx, `updated ${rowId}`)
  return { rowId, changed: written.changed, warning: written.warning }
}

async function setEnabled(ctx, input) {
  const rowId = String(input?.rowId ?? input?.id ?? '').trim()
  if (rowId === '') throw new Error('缺少 rowId')
  const enabled = input?.enabled !== false
  const written = await editPatch(ctx, (document, YAML) => {
    const rows = findRows(document, YAML, rowId)
    if (rows.length === 0) {
      if (enabled === true) return false
      document.add({ id: rowId, disabled: true })
      return true
    }
    let touched = false
    for (const row of rows) {
      const disabled = row.item.get('disabled') === true
      if (enabled === true) {
        if (disabled === false) continue
        row.item.delete('disabled')
      } else {
        if (disabled === true) continue
        row.item.set('disabled', true)
      }
      touched = true
    }
    return touched
  })
  log(ctx, `${enabled ? 'enabled' : 'disabled'} ${rowId}`)
  return { rowId, enabled, changed: written.changed, warning: written.warning }
}

async function removeServer(ctx, input) {
  const rowId = String(input?.rowId ?? input?.id ?? '').trim()
  if (rowId === '') throw new Error('缺少 rowId')
  const written = await editPatch(ctx, (document, YAML) => {
    const rows = findRows(document, YAML, rowId)
    if (rows.length === 0) {
      // 行不属于 profile（由已安装的 bundle 带入）：只能禁用，不能删掉别人的声明。
      document.add({ id: rowId, disabled: true })
      return true
    }
    for (const row of rows) {
      const index = row.seq.items.indexOf(row.item)
      if (index >= 0) row.seq.items.splice(index, 1)
    }
    return true
  })
  log(ctx, `removed ${rowId}`)
  return { rowId, changed: written.changed, warning: written.warning }
}

async function restartServer(ctx, input) {
  const rowId = String(input?.rowId ?? input?.id ?? '').trim()
  const off = await setEnabled(ctx, { rowId, enabled: false })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 400)
    timer.unref?.()
  })
  const on = await setEnabled(ctx, { rowId, enabled: true })
  return { rowId, changed: off.changed || on.changed }
}

//#endregion

function createCockpit(ctx) {
  const list = async () => {
    const servers = await listServers(ctx)
    let patchFile = ''
    try {
      patchFile = patchPathOf(ctx)
    } catch {
      patchFile = ''
    }
    return { servers, patchFile }
  }
  return {
    list,
    add: (input) => addServer(ctx, input),
    update: (input) => updateServer(ctx, input),
    setEnabled: (input) => setEnabled(ctx, input),
    remove: (input) => removeServer(ctx, input),
    restart: (input) => restartServer(ctx, input),
  }
}

function registerRoute(ctx, cockpit) {
  const server = ctx.get('webServer')
  if (server === undefined || server === null || typeof server.register !== 'function') return false
  const handler = async (req, res) => {
    const method = String(req?.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method' })
    if (requestAllowed(req) === false) return sendJson(res, 403, { ok: false, error: 'forbidden' })
    try {
      if (method === 'GET') {
        const state = await cockpit.list()
        return sendJson(res, 200, { ok: true, ...state })
      }
      const body = await readJsonBody(req)
      if (body === null || body === undefined) return sendJson(res, 400, { ok: false, error: 'bad-body' })
      const action = typeof body.action === 'string' ? body.action : ''
      if (action === 'list' || action === '') {
        const state = await cockpit.list()
        return sendJson(res, 200, { ok: true, ...state })
      }
      let result
      switch (action) {
        case 'add':
          result = await cockpit.add(body.input ?? body)
          break
        case 'update':
          result = await cockpit.update({ rowId: body.rowId, ...(body.input ?? {}) })
          break
        case 'enable':
          result = await cockpit.setEnabled({ rowId: body.rowId, enabled: true })
          break
        case 'disable':
          result = await cockpit.setEnabled({ rowId: body.rowId, enabled: false })
          break
        case 'remove':
          result = await cockpit.remove({ rowId: body.rowId })
          break
        case 'restart':
          result = await cockpit.restart({ rowId: body.rowId })
          break
        default:
          return sendJson(res, 400, { ok: false, error: `unknown action: ${action}` })
      }
      const state = await cockpit.list()
      return sendJson(res, 200, { ok: true, result, ...state })
    } catch (error) {
      const message = String(error?.message ?? error)
      log(ctx, `action failed: ${message}`)
      return sendJson(res, 200, { ok: false, error: message })
    }
  }
  ctx.effect(() => server.register({ kind: 'exact', path: ROUTE, handler }), 'mcp-cockpit: route')
  return true
}

function registerTool(ctx, cockpit) {
  const tools = ctx.get('tools')
  if (tools === undefined || tools === null || typeof tools.register !== 'function') return false
  ctx.effect(
    () =>
      tools.register({
        name: 'mcp_cockpit',
        description:
          '管理本机 MCP 服务器：列出现状、新增、改配置、启用、禁用、重连、删除。改完立即生效，不需要重启 DSH。',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'add', 'update', 'enable', 'disable', 'restart', 'remove'],
              description: 'list 只读；其余改动 profile 的 MCP 配置行',
            },
            rowId: { type: 'string', description: '目标行 id，例如 mcp-windows' },
            input: { type: 'object', additionalProperties: true, description: 'add/update 的服务器配置' },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'failed'] },
              message: { type: 'string' },
              servers: { type: 'array', items: { type: 'object', additionalProperties: true } },
              result: { type: 'object', additionalProperties: true },
            },
            required: ['status'],
            additionalProperties: false,
          },
          render: (_args, value) => [
            { type: 'text', text: `MCP · ${value.status}${value.message === undefined ? '' : ` · ${value.message}`}` },
          ],
        },
        execute: async (args) => {
          try {
            const action = String(args?.action ?? '')
            if (action === 'list') {
              const state = await cockpit.list()
              return { status: 'ok', message: `${state.servers.length} 个服务器`, servers: state.servers }
            }
            if (action === 'add') {
              const result = await cockpit.add(args?.input ?? {})
              return { status: 'ok', message: `已新增 ${result.rowId}`, result }
            }
            if (action === 'update') {
              const result = await cockpit.update({ rowId: args?.rowId, ...(args?.input ?? {}) })
              return { status: 'ok', message: `已更新 ${result.rowId}`, result }
            }
            if (action === 'enable' || action === 'disable') {
              const result = await cockpit.setEnabled({ rowId: args?.rowId, enabled: action === 'enable' })
              return { status: 'ok', message: `${action === 'enable' ? '已启用' : '已禁用'} ${result.rowId}`, result }
            }
            if (action === 'restart') {
              const result = await cockpit.restart({ rowId: args?.rowId })
              return { status: 'ok', message: `已重连 ${result.rowId}`, result }
            }
            if (action === 'remove') {
              const result = await cockpit.remove({ rowId: args?.rowId })
              return { status: 'ok', message: `已删除 ${result.rowId}`, result }
            }
            return { status: 'failed', message: `未知动作：${action}` }
          } catch (error) {
            return { status: 'failed', message: String(error?.message ?? error) }
          }
        },
      }),
    'mcp-cockpit: tool',
  )
  return true
}

export function apply(ctx) {
  const cockpit = createCockpit(ctx)
  try {
    ctx.provide('mcpCockpit', cockpit)
  } catch (error) {
    log(ctx, `service not provided: ${error?.message ?? error}`)
  }
  registerRoute(ctx, cockpit)
  registerTool(ctx, cockpit)
}
