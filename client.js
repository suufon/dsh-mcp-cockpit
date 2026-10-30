/**
 * dsh-mcp-cockpit — 设置页（Web 端）。
 *
 * 一个页面管理本机全部 MCP 服务器：看状态、看工具数、新增、改配置、启停、重连、删除。
 * 数据全部来自 Host 半边的 /dsh-mcp-cockpit 同源路由，页面不猜任何状态。
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-cockpit',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'mcp-cockpit'
    const ROUTE = '/dsh-mcp-cockpit'
    const GATE = 'x-dsh-mcp-cockpit'

    const CSS = `
.mcx-root { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; }
.mcx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.mcx-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mcx-sub { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.mcx-actions { display: flex; gap: 8px; flex: none; }
.mcx-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); border-radius: var(--dsw-radius-sm); padding: 5px 11px; font-size: 12px; line-height: 18px; cursor: pointer; }
.mcx-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.mcx-btn:disabled { opacity: .45; cursor: default; }
.mcx-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary-new-colorprimary-new-color); color: #fff; }
.mcx-btn-danger { color: var(--dsw-alias-state-error-primary); }
.mcx-list { display: flex; flex-direction: column; gap: 8px; }
.mcx-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-2); padding: 11px 13px; display: flex; flex-direction: column; gap: 8px; }
.mcx-card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcx-name { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mcx-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.mcx-tag { font-size: 11px; line-height: 16px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.mcx-tag-on { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.mcx-tag-off { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
.mcx-tag-warn { color: var(--dsw-alias-label-tertiary); }
.mcx-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mcx-empty { border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); padding: 22px; text-align: center; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.mcx-note { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-tertiary); }
.mcx-error { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.mcx-form { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-2); padding: 13px; display: flex; flex-direction: column; gap: 10px; }
.mcx-field { display: flex; flex-direction: column; gap: 4px; }
.mcx-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.mcx-input, .mcx-select, .mcx-area { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 12.5px; line-height: 1.5; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); padding: 6px 8px; }
.mcx-area { min-height: 62px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mcx-row { display: flex; gap: 10px; }
.mcx-row > * { flex: 1; min-width: 0; }
`

    const COPY = {
      zh: {
        nav: 'MCP 服务器',
        title: 'MCP 服务器',
        lead: '这里改的就是 profile 的 MCP 配置行；保存后自动重连，无需重启 DSH。',
        refresh: '刷新',
        add: '新增服务器',
        empty: '还没有 MCP 服务器。点「新增服务器」填一条。',
        loading: '读取中…',
        enabled: '启用',
        disabled: '已禁用',
        tools: '工具',
        toolUnit: '个工具',
        noTools: '无工具',
        edit: '编辑',
        enable: '启用',
        disable: '禁用',
        restart: '重连',
        remove: '删除',
        save: '保存',
        cancel: '取消',
        confirmRemove: '确定删除这条 MCP 服务器？',
        confirmDisable: '禁用后它的工具会立刻从模型可见列表里消失，继续？',
        serverName: '名称（工具前缀，字母数字下划线短横线）',
        transport: '传输方式',
        command: '启动命令',
        args: '参数（每行一个）',
        cwd: '工作目录（可空）',
        env: '环境变量（KEY=VALUE，每行一个）',
        envKeep: '留空表示不改动；当前已有：',
        url: '服务地址（http/https）',
        headers: '请求头（KEY=VALUE，每行一个）',
        timeout: '工具超时（毫秒，可空）',
        failOnStartup: '启动失败时让插件报错',
        failOnStartupHint: '关掉时服务器连不上只是工具缺失，不影响启动。',
        patchFile: '配置文件',
        working: '处理中…',
        'phase.active': '运行中',
        'phase.loading': '连接中',
        'phase.pending': '待加载',
        'phase.failed': '加载失败',
        'phase.unloading': '卸载中',
        'phase.unknown': '状态未知',
      },
      en: {
        nav: 'MCP servers',
        title: 'MCP servers',
        lead: 'These rows are the profile MCP configuration. Saving reconnects the server without restarting DSH.',
        refresh: 'Refresh',
        add: 'Add server',
        empty: 'No MCP server yet. Use “Add server”.',
        loading: 'Loading…',
        enabled: 'Enabled',
        disabled: 'Disabled',
        tools: 'tools',
        toolUnit: 'tools',
        noTools: 'no tools',
        edit: 'Edit',
        enable: 'Enable',
        disable: 'Disable',
        restart: 'Reconnect',
        remove: 'Remove',
        save: 'Save',
        cancel: 'Cancel',
        confirmRemove: 'Remove this MCP server?',
        confirmDisable: 'Its tools vanish from the model immediately. Continue?',
        serverName: 'Name (tool prefix: letters, digits, _ and -)',
        transport: 'Transport',
        command: 'Command',
        args: 'Arguments (one per line)',
        cwd: 'Working directory (optional)',
        env: 'Environment (KEY=VALUE, one per line)',
        envKeep: 'Leave empty to keep the current one. Existing:',
        url: 'Server URL (http/https)',
        headers: 'Headers (KEY=VALUE, one per line)',
        timeout: 'Tool timeout (ms, optional)',
        failOnStartup: 'Fail the plugin when startup fails',
        failOnStartupHint: 'When off, an unreachable server only loses its tools.',
        patchFile: 'Config file',
        working: 'Working…',
        'phase.active': 'running',
        'phase.loading': 'connecting',
        'phase.pending': 'pending',
        'phase.failed': 'failed',
        'phase.unloading': 'unloading',
        'phase.unknown': 'unknown',
      },
    }

    function splitLines(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
    }

    function parsePairs(text) {
      const out = {}
      for (const line of splitLines(text)) {
        const cut = line.indexOf('=')
        if (cut <= 0) continue
        const key = line.slice(0, cut).trim()
        if (key === '') continue
        out[key] = line.slice(cut + 1).trim()
      }
      return out
    }

    function emptyForm() {
      return {
        mode: 'add',
        rowId: '',
        serverName: '',
        transport: 'stdio',
        command: '',
        argsText: '',
        cwd: '',
        envText: '',
        url: '',
        headersText: '',
        timeout: '',
        failOnStartupError: false,
        envKeys: '',
        headerKeys: '',
      }
    }

    function formFromServer(server) {
      return {
        mode: 'edit',
        rowId: server.rowId,
        serverName: server.serverName,
        transport: server.transport,
        command: server.command,
        argsText: (server.args ?? []).join('\n'),
        cwd: server.cwd,
        envText: '',
        url: server.url,
        headersText: '',
        timeout: server.toolCallTimeoutMs === null ? '' : String(server.toolCallTimeoutMs),
        failOnStartupError: server.failOnStartupError === true,
        envKeys: (server.envKeys ?? []).join(', '),
        headerKeys: (server.headerKeys ?? []).join(', '),
      }
    }

    function payloadOf(form) {
      const input = { serverName: form.serverName.trim(), transport: form.transport }
      if (form.transport === 'stdio') {
        input.command = form.command.trim()
        input.args = splitLines(form.argsText)
        input.cwd = form.cwd.trim()
        const env = parsePairs(form.envText)
        if (Object.keys(env).length > 0) input.env = env
      } else {
        input.url = form.url.trim()
        const headers = parsePairs(form.headersText)
        if (Object.keys(headers).length > 0) input.headers = headers
      }
      const timeout = Number(form.timeout)
      if (Number.isFinite(timeout) && timeout > 0) input.toolCallTimeoutMs = Math.round(timeout)
      input.failOnStartupError = form.failOnStartupError === true
      return input
    }

    function createSection(ctx, t) {
      const request = async (body) => {
        const init =
          body === undefined
            ? { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { [GATE]: '1' } }
            : {
                method: 'POST',
                cache: 'no-store',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json', [GATE]: '1' },
                body: JSON.stringify(body),
              }
        const response = await fetch(ROUTE, init)
        const text = await response.text()
        let payload
        try {
          payload = JSON.parse(text)
        } catch {
          throw new Error(`响应不是 JSON（HTTP ${response.status}）`)
        }
        if (payload?.ok !== true) throw new Error(String(payload?.error ?? `HTTP ${response.status}`))
        return payload
      }

      function Field(props) {
        return h(
          'label',
          { className: 'mcx-field' },
          h('span', { className: 'mcx-label' }, props.label),
          props.children,
          props.hint === undefined ? null : h('span', { className: 'mcx-note' }, props.hint),
        )
      }

      function Form(props) {
        const { form, setForm, onCancel, onSave, busy } = props
        const patch = (next) => setForm({ ...form, ...next })
        const stdio = form.transport === 'stdio'
        return h(
          'div',
          { className: 'mcx-form' },
          h('div', { className: 'mcx-row' }, [
            h(Field, { key: 'n', label: t('serverName') }, h('input', {
              className: 'mcx-input',
              value: form.serverName,
              spellCheck: false,
              onChange: (event) => patch({ serverName: event.target.value }),
            })),
            h(Field, { key: 't', label: t('transport') }, h(
              'select',
              {
                className: 'mcx-select',
                value: form.transport,
                onChange: (event) => patch({ transport: event.target.value }),
              },
              h('option', { value: 'stdio' }, 'stdio'),
              h('option', { value: 'streamable-http' }, 'streamable-http'),
            )),
          ]),
          stdio
            ? h(Field, { label: t('command') }, h('input', {
                className: 'mcx-input',
                value: form.command,
                spellCheck: false,
                onChange: (event) => patch({ command: event.target.value }),
              }))
            : null,
          stdio
            ? h(Field, { key: 'a', label: t('args') }, h('textarea', {
                className: 'mcx-area',
                value: form.argsText,
                spellCheck: false,
                onChange: (event) => patch({ argsText: event.target.value }),
              }))
            : h(Field, { label: t('url') }, h('input', {
                className: 'mcx-input',
                value: form.url,
                spellCheck: false,
                onChange: (event) => patch({ url: event.target.value }),
              })),
          stdio
            ? h(Field, { key: 'c', label: t('cwd') }, h('input', {
                className: 'mcx-input',
                value: form.cwd,
                spellCheck: false,
                onChange: (event) => patch({ cwd: event.target.value }),
              }))
            : null,
          stdio
            ? h(Field, {
                key: 'e',
                label: t('env'),
                hint: form.envKeys === '' ? undefined : `${t('envKeep')} ${form.envKeys}`,
              }, h('textarea', {
                className: 'mcx-area',
                value: form.envText,
                spellCheck: false,
                placeholder: 'LOG_LEVEL=1',
                onChange: (event) => patch({ envText: event.target.value }),
              }))
            : h(Field, {
                key: 'hd',
                label: t('headers'),
                hint: form.headerKeys === '' ? undefined : `${t('envKeep')} ${form.headerKeys}`,
              }, h('textarea', {
                className: 'mcx-area',
                value: form.headersText,
                spellCheck: false,
                onChange: (event) => patch({ headersText: event.target.value }),
              })),
          h(Field, { label: t('timeout') }, h('input', {
            className: 'mcx-input',
            value: form.timeout,
            spellCheck: false,
            onChange: (event) => patch({ timeout: event.target.value }),
          })),
          h(
            'label',
            { className: 'mcx-field' },
            h('span', { className: 'mcx-label' }, [
              h('input', {
                key: 'cb',
                type: 'checkbox',
                checked: form.failOnStartupError === true,
                onChange: (event) => patch({ failOnStartupError: event.target.checked }),
              }),
              ` ${t('failOnStartup')}`,
            ]),
            h('span', { className: 'mcx-note' }, t('failOnStartupHint')),
          ),
          h(
            'div',
            { className: 'mcx-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'mcx-btn mcx-btn-primary',
                disabled: busy,
                onClick: () => onSave(form),
              },
              busy ? t('working') : t('save'),
            ),
            h('button', { type: 'button', className: 'mcx-btn', onClick: onCancel }, t('cancel')),
          ),
        )
      }

      return function CockpitSection() {
        const [state, setState] = React.useState({ phase: 'loading', servers: [], patchFile: '' })
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [editing, setEditing] = React.useState(null)

        const load = React.useCallback(async () => {
          try {
            const payload = await request()
            setState({ phase: 'ready', servers: Array.isArray(payload.servers) ? payload.servers : [], patchFile: String(payload.patchFile ?? '') })
            setError('')
          } catch (failure) {
            setState((previous) => ({ ...previous, phase: 'ready' }))
            setError(String(failure?.message ?? failure))
          }
        }, [])

        React.useEffect(() => {
          void load()
        }, [load])

        const act = React.useCallback(
          async (body) => {
            setBusy(true)
            try {
              const payload = await request(body)
              setState({ phase: 'ready', servers: Array.isArray(payload.servers) ? payload.servers : [], patchFile: String(payload.patchFile ?? '') })
              setError('')
              return true
            } catch (failure) {
              setError(String(failure?.message ?? failure))
              return false
            } finally {
              setBusy(false)
            }
          },
          [],
        )

        const onSave = async (form) => {
          const input = payloadOf(form)
          const ok =
            form.mode === 'add'
              ? await act({ action: 'add', input })
              : await act({ action: 'update', rowId: form.rowId, input })
          if (ok) setEditing(null)
        }

        const rows = state.servers
        return h(
          'div',
          { className: 'mcx-root' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'mcx-head' },
            h(
              'div',
              null,
              h('div', { className: 'mcx-title' }, t('title')),
              h('div', { className: 'mcx-sub' }, t('lead')),
              state.patchFile === '' ? null : h('div', { className: 'mcx-sub mcx-mono' }, `${t('patchFile')}: ${state.patchFile}`),
            ),
            h(
              'div',
              { className: 'mcx-actions' },
              h('button', { type: 'button', className: 'mcx-btn', disabled: busy, onClick: () => void load() }, t('refresh')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mcx-btn mcx-btn-primary',
                  disabled: busy,
                  onClick: () => setEditing(emptyForm()),
                },
                t('add'),
              ),
            ),
          ),
          error === '' ? null : h('div', { className: 'mcx-error' }, error),
          editing === null
            ? null
            : h(Form, {
                form: editing,
                setForm: setEditing,
                busy,
                onCancel: () => setEditing(null),
                onSave,
              }),
          state.phase === 'loading'
            ? h('div', { className: 'mcx-empty' }, t('loading'))
            : rows.length === 0
              ? h('div', { className: 'mcx-empty' }, t('empty'))
              : h(
                  'div',
                  { className: 'mcx-list' },
                  rows.map((server) => {
                    const enabled = server.enabled !== false
                    const phaseText = t(`phase.${String(server.phase ?? 'unknown')}`)
                    const toolText = server.tools > 0 ? `${server.tools} ${t('toolUnit')}` : t('noTools')
                    return h(
                      'div',
                      { className: 'mcx-card', key: server.rowId },
                      h(
                        'div',
                        { className: 'mcx-card-top' },
                        h('span', { className: 'mcx-name' }, server.serverName),
                        h('span', { className: `mcx-tag ${enabled ? 'mcx-tag-on' : 'mcx-tag-off'}` }, enabled ? t('enabled') : t('disabled')),
                        h('span', { className: 'mcx-tag' }, server.transport),
                        h('span', { className: `mcx-tag ${server.tools > 0 ? '' : 'mcx-tag-warn'}` }, toolText),
                        h('span', { className: 'mcx-tag mcx-tag-warn' }, phaseText),
                      ),
                      h(
                        'div',
                        { className: 'mcx-mono' },
                        server.transport === 'streamable-http' ? server.url : [server.command, ...(server.args ?? [])].join(' '),
                      ),
                      h(
                        'div',
                        { className: 'mcx-card-actions' },
                        h('button', { type: 'button', className: 'mcx-btn', disabled: busy, onClick: () => setEditing(formFromServer(server)) }, t('edit')),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'mcx-btn',
                            disabled: busy,
                            onClick: () => {
                              if (enabled && window.confirm(t('confirmDisable')) !== true) return
                              void act({ action: enabled ? 'disable' : 'enable', rowId: server.rowId })
                            },
                          },
                          enabled ? t('disable') : t('enable'),
                        ),
                        h('button', { type: 'button', className: 'mcx-btn', disabled: busy, onClick: () => void act({ action: 'restart', rowId: server.rowId }) }, t('restart')),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'mcx-btn mcx-btn-danger',
                            disabled: busy,
                            onClick: () => {
                              if (window.confirm(t('confirmRemove')) !== true) return
                              void act({ action: 'remove', rowId: server.rowId })
                            },
                          },
                          t('remove'),
                        ),
                      ),
                    )
                  }),
                ),
        )
      }
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, COPY), 'mcp-cockpit: copy dictionaries')
      const t = ctx.locale.bind(NS)
      const Section = createSection(ctx, t)
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'mcp-cockpit',
            order: 17,
            label: () => t('nav'),
          },
          Section,
        ),
      )
    }

    return { name: 'dsh-mcp-cockpit', inject, apply }
  },
})
