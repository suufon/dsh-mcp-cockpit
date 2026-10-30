# dsh-mcp-cockpit

在一个页面里管理本机全部 MCP 服务器。

一个 MCP 服务器在 DSH 里就是 profile 里的一行 `@deepseek-ai/dsh-mcp-client` 插件，
所以这个插件做的事就是：把这族配置行读出来给你看，并让你增删改它们——然后立刻生效。

## 功能

- **一页看全**：每个服务器的名称、传输方式、启动命令或地址、启用状态、Loader 阶段、
  当前注册到模型可见列表里的工具数（`mcp__<serverName>__*`）。
- **新增**：填名称 + stdio（command/args/cwd/env/超时）或 streamable-http（url/headers）。
- **改配置**：就地把新配置合并进同一行（不会多出一条覆盖行）。
- **启用 / 禁用**：在 profile patch 里给对应行加/去 `disabled`。
- **重连**：禁用后再启用，等于让 mcp-client 重新握手。
- **删除**：profile 里的行整条移掉；由已安装 bundle 声明的行改成禁用，不动别人的声明。
- 设置页在「设置 → MCP 服务器」（Plugins 之后）。
- 同样的能力也暴露成一个工具 `mcp_cockpit`，模型可以直接调用。

## 安装

```bash
dsh plugin --profile desktop add dsh-mcp-cockpit@github:suufon/dsh-mcp-cockpit
```

或者把仓库克隆到本地任意目录，用 DSH 的插件管理器按路径安装：

```bash
git clone https://github.com/suufon/dsh-mcp-cockpit.git
dsh plugin --profile desktop add /absolute/path/to/dsh-mcp-cockpit
```

装好刷新页面即可，设置里会出现「MCP 服务器」一页。

## 状态的含义

页面只报观测到的事实，读不到就写「状态未知」：

| 字段 | 来源 |
| --- | --- |
| 启用 | profile 行的 `disabled` 或 pluginManager 的 `enabled` |
| 阶段 | pluginManager 的 `fiberPhase`（active = 运行中） |
| 工具数 | `tools.schemas()` 里以 `mcp__<serverName>__` 开头的条目数 |

所以「运行中但 0 个工具」就是服务器起来了却没注册工具，通常要看它自己的日志。

## 写入路径

所有改动走同一条：读改写 profile 的 `cordis.patch.yml`，再 `hmr.reconcileProfile()` 立刻应用。

改 profile patch 的整段读改写包在 `hmr.runExclusive()` 里，避免和 HMR 的文件 watcher 交错；
写前留一份 `cordis.patch.yml.bak-mcpcockpit`，先写临时文件再 rename，不会留下半个文件。
重放配置失败时文件不回滚（改动已经落盘），失败原因原样显示在页面上。

> 为什么不直接用 `configEditor.edit()`：它只改已有行的 `config`，且在**顶层**追加一条覆盖行——
> 同一个 id 会变成两份。所以合并配置也走上面这条路径，并顺手把历史上重复的同 id 行一起收敛。

## 凭据

`env` 和 `headers` 的值永远不离开 Host 进程。页面只拿到键名（用于提示「当前已有：…」），
编辑时留空表示不改动这些键。

## 配置

无需配置。挂载后即注册设置页、HTTP 路由 `/dsh-mcp-cockpit` 和工具 `mcp_cockpit`。

HTTP 路由只接受同源页面、带 `x-dsh-mcp-cockpit` 标记头、Host 为回环地址的请求；
方法限 GET/POST，body 上限 1 MiB。

## 许可

MIT
