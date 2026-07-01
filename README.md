# @false00/pi-powerline

`@false00/pi-powerline` is a maintained fork of [`jwu/pi-powerline`](https://github.com/jwu/pi-powerline), continuing to provide powerline-style UI extensions for [pi](https://github.com/earendil-works/pi-mono): a custom editor, breadcrumb, footer, and header.

The upstream inspiration still comes from [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer).

![screenshot](https://raw.githubusercontent.com/false00/pi-powerline/refs/heads/main/assets/pi-powerline.png)

## Differences from upstream

This fork currently includes the following explicit additions:

1. **Fixes stale ctx crashes**
   - Fixes cases where old UI components kept reading an invalid `ExtensionContext` after `ctx.reload()`, `ctx.newSession()`, `ctx.fork()`, or `ctx.switchSession()` and triggered:
     - `This extension ctx is stale after session replacement or reload`
   - Approach:
     - breadcrumb / widget / editor / header / footer now use snapshot state instead of holding long-lived old ctx references
     - custom UI state is proactively cleaned up during `session_shutdown`
2. **Footer supports subagent-inclusive token totals**
   - If `@tintinweb/pi-subagents` is installed and used, the footer shows an extra `Σ...` segment.
   - `Σ` represents the combined total of the current main-session tokens plus subagent tokens.
   - That total is written into the current session when subagents complete, so it remains available after `/resume`.
3. **More consistent cross-platform path display**
   - Header-rendered context, extension, and package paths are normalized to `/`, reducing Windows/Unix display differences.
4. **Development checks use standard Node/npm commands**
   - Uses `npm test`, `npm run typecheck`, and `npm run lint`, so local validation no longer depends on bun.

## Install

### Install from npm

```bash
pi install npm:@false00/pi-powerline
```

### Install from GitHub

```bash
pi install git:github.com/false00/pi-powerline
```

## Settings

Settings are read from both global and project configuration, with project settings taking precedence.

| Location | Scope |
|---|---|
| `~/.pi/agent/settings.json` | Global |
| `.pi/settings.json` | Current project |

```json
{
  "powerline": true,
  "breadcrumb": "inner",
  "footer": true,
  "header": true,
  "header-info": true
}
```

| Setting | Values | Default | Description |
|---|---|---|---|
| `powerline` | `true` / `false` | `true` | Master switch |
| `breadcrumb` | `"hide"` / `"top"` / `"inner"` | `"inner"` | Breadcrumb placement |
| `footer` | `true` / `false` | `true` | Enable custom footer |
| `header` | `true` / `false` | `true` | Enable gradient header |
| `header-info` | `true` / `false` | `true` | Show diagnostic info during startup/reload |

### Nerd Font icons

If the terminal supports Nerd Font, icons are enabled automatically. Detection order:

1. `PI_NERD_FONTS=1` forces icons on
2. `PI_NERD_FONTS=0` forces icons off
3. `GHOSTTY_RESOURCES_DIR` implies support
4. `TERM_PROGRAM` or `TERM` contains `iterm`, `wezterm`, `kitty`, `ghostty`, or `alacritty`
5. Otherwise it falls back to plain text

For SSH sessions or terminals that cannot be detected reliably, set it explicitly:

```bash
export PI_NERD_FONTS=1
```

### Header diagnostics

`header-info` displays the following under the header:

- `Context`: system-prompt context files such as `AGENTS.md` and `.pi/APPEND_SYSTEM.md`
- `Packages`: configured pi packages
- `Tools`: currently active tools
- `Skills`: loaded skills
- `Prompts`: loaded prompt commands
- `Extensions`: loaded extension paths

It is rendered only for `startup` and `reload`; it is not shown for `new`, `resume`, or `fork`.
It also requires Pi's `quietStartup` setting to be `true`:

```json
{
  "quietStartup": true,
  "header-info": true
}
```

## Commands

| Command | Description |
|---|---|
| `/powerline` | Toggle the master switch |
| `/powerline info` | Show current settings |
| `/powerline breadcrumb:top\|inner\|hide` | Set breadcrumb mode |
| `/powerline footer:on\|off` | Toggle footer |
| `/powerline header:on\|off` | Toggle header |
| `/powerline header-info:on\|off` | Toggle header diagnostics |

## Development and verification

```bash
npm install
npm test
npm run typecheck
npm run lint
```

This repository includes:

- `tsconfig.check.json`: reproducible TypeScript check configuration
- `semantic-release`: automated release config for GitHub / npm
- `CHANGELOG.md`: explicit fork version history

## License

MIT
