# @false00/pi-powerline

`@false00/pi-powerline` 是 [`jwu/pi-powerline`](https://github.com/jwu/pi-powerline) 的维护分叉版，继续提供给 [pi](https://github.com/earendil-works/pi-mono) 的 powerline 风格 UI 扩展：自定义编辑器、breadcrumb、footer 和 header。

上游灵感来源仍然是 [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer)。

![screenshot](https://raw.githubusercontent.com/false00/pi-powerline/refs/heads/main/assets/pi-powerline.png)

## 与上游的差异

当前 fork 明确包含以下新增变更：

1. **修复 stale ctx 崩溃**
   - 修复 `ctx.reload()`、`ctx.newSession()`、`ctx.fork()`、`ctx.switchSession()` 之后，旧 UI 组件继续读取已失效 `ExtensionContext`，从而触发：
     - `This extension ctx is stale after session replacement or reload`
   - 处理方式：
     - breadcrumb / widget / editor / header / footer 改为使用快照状态而不是长期捕获旧 ctx
     - 在 `session_shutdown` 时主动清理自定义 UI 组件状态
2. **footer 支持子代理总 token 汇总**
   - 如果安装并使用 `@tintinweb/pi-subagents`，footer 会额外显示 `Σ...` 段。
   - `Σ` 表示当前主会话 token 与 subagents token 的合计总量。
   - 该总量会在子代理完成时写入当前 session，因此 `/resume` 后仍能保留历史累计值。
3. **跨平台路径显示更一致**
   - header 中展示的上下文、扩展和包路径统一使用 `/`，减少 Windows 与 Unix 输出差异。
4. **开发检查改为标准 Node/npm**
   - 使用 `npm test`、`npm run typecheck`、`npm run lint`，不再依赖本地 bun 才能验证仓库。

## 安装

### 从 npm 安装

```bash
pi install npm:@false00/pi-powerline
```

### 从 GitHub 安装

```bash
pi install git:github.com/false00/pi-powerline
```

## 设置

设置会同时从全局和项目配置读取，项目配置优先级更高。

| 位置 | 作用域 |
|---|---|
| `~/.pi/agent/settings.json` | 全局 |
| `.pi/settings.json` | 当前项目 |

```json
{
  "powerline": true,
  "breadcrumb": "inner",
  "footer": true,
  "header": true,
  "header-info": true
}
```

| 设置项 | 可选值 | 默认值 | 说明 |
|---|---|---|---|
| `powerline` | `true` / `false` | `true` | 总开关 |
| `breadcrumb` | `"hide"` / `"top"` / `"inner"` | `"inner"` | breadcrumb 位置 |
| `footer` | `true` / `false` | `true` | 是否启用自定义 footer |
| `header` | `true` / `false` | `true` | 是否启用渐变 header |
| `header-info` | `true` / `false` | `true` | 是否在 startup/reload 时显示诊断信息 |

### Nerd Font 图标

如果终端支持 Nerd Font，会自动启用图标。判断顺序：

1. `PI_NERD_FONTS=1` 强制开启
2. `PI_NERD_FONTS=0` 强制关闭
3. `GHOSTTY_RESOURCES_DIR` 存在时视为支持
4. `TERM_PROGRAM` 或 `TERM` 包含 `iterm`、`wezterm`、`kitty`、`ghostty`、`alacritty`
5. 否则回退为纯文本

SSH 或无法可靠识别的终端，建议手动指定：

```bash
export PI_NERD_FONTS=1
```

### Header 诊断信息

`header-info` 会在 header 下显示：

- `Context`：系统提示上下文文件，如 `AGENTS.md`、`.pi/APPEND_SYSTEM.md`
- `Packages`：已配置 pi package
- `Tools`：当前激活工具
- `Skills`：已加载 skills
- `Prompts`：已加载 prompt commands
- `Extensions`：已加载扩展路径

仅在 `startup` 和 `reload` 渲染；`new` / `resume` / `fork` 不显示。
同时要求 Pi 的 `quietStartup` 为 `true`：

```json
{
  "quietStartup": true,
  "header-info": true
}
```

## 命令

| 命令 | 说明 |
|---|---|
| `/powerline` | 切换总开关 |
| `/powerline info` | 查看当前设置 |
| `/powerline breadcrumb:top\|inner\|hide` | 设置 breadcrumb 模式 |
| `/powerline footer:on\|off` | 开关 footer |
| `/powerline header:on\|off` | 开关 header |
| `/powerline header-info:on\|off` | 开关 header 诊断信息 |

## 开发与验证

```bash
npm install
npm test
npm run typecheck
npm run lint
```

当前仓库包含：

- `tsconfig.check.json`：可复现的 TypeScript 检查配置
- `semantic-release`：发布到 GitHub / npm 的自动化配置
- `CHANGELOG.md`：显式记录 fork 版本变更

## 许可证

MIT
