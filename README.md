# pi-powerline

Powerline-style UI extensions for [pi](https://github.com/badlogic/pi-mono): custom editor, breadcrumb, footer, and header.

Highly inspired by [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer).

![screenshot](https://raw.githubusercontent.com/jwu/pi-powerline/refs/heads/main/assets/pi-powerline.png)

## Install

```bash
pi install npm:pi-powerline
```

## Settings

Settings are read from both global and project files. Project settings override global settings.

| Location | Scope |
|----------|-------|
| `~/.pi/agent/settings.json` | Global |
| `.pi/settings.json` | Current project |

```json
// .pi/settings.json
{
  "powerline": true,
  "breadcrumb": "inner",
  "footer": true,
  "header": true,
  "header-info": false
}
```

| Setting | Values | Default | Effect |
|---------|--------|---------|--------|
| `powerline` | `true` / `false` | `true` | Master switch for all pi-powerline UI extensions |
| `breadcrumb` | `"hide"` / `"top"` / `"inner"` | `"inner"` | Breadcrumb placement |
| `footer` | `true` / `false` | `true` | Enable custom footer |
| `header` | `true` / `false` | `true` | Enable custom gradient-logo header |
| `header-info` | `true` / `false` | `false` | Show header diagnostic info on startup/reload |

### Header info

`header-info` adds diagnostic sections under the header:

- `Context` — loaded system prompt context files, such as `AGENTS.md` and `.pi/APPEND_SYSTEM.md`
- `Skills` — loaded skills
- `Prompts` — loaded prompt commands
- `Extensions` — loaded extension packages or paths

It is only rendered for `startup` and `reload`, never for new sessions. It also requires Pi's `quietStartup` setting to be `true`:

```json
{
  "quietStartup": true,
  "header-info": true
}
```

## Commands

| Command | Effect |
|---------|--------|
| `/powerline` | Toggle all extensions on/off |
| `/powerline info` | Show current settings |
| `/powerline breadcrumb:top\|inner\|hide` | Set breadcrumb mode |
| `/powerline footer:on\|off` | Toggle footer |
| `/powerline header:on\|off` | Toggle header |
| `/powerline header-info:on\|off` | Toggle header diagnostic info |

## License

MIT
