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
2. **Footer supports subagent-inclusive token totals and cost estimates**
   - If `@tintinweb/pi-subagents` is installed and used, the footer shows extra `Σ↑...` and `Σ↓...` segments.
   - Those segments represent the summed input and output tokens used by all subagents in the current session.
   - When subagent cost data is available, the footer also shows `Σ$...` for summed subagent cost and `T$...` for the combined main-session + subagent cost.
   - Subscription-auth cost displays are labeled with `est` so Copilot / OAuth-backed sessions are clearly shown as estimates rather than exact billing.
   - That usage is written into the current session when subagents complete, so it remains available after `/resume`.
3. **More consistent cross-platform path display**
   - Header-rendered context, extension, and package paths are normalized to `/`, reducing Windows/Unix display differences.
4. **Development checks use standard Node/npm commands**
   - Uses `npm test`, `npm run typecheck`, and `npm run lint`, so local validation no longer depends on bun.

## What this package changes in Pi

This package is a **Pi UI package**, not a model/provider package.
It changes how parts of Pi's terminal UI are rendered and how a few related settings are toggled, but it does **not** change the underlying model response text, tool execution semantics, or provider transport.

At a high level, it does all of the following:

1. **Registers powerline-specific Pi flags**
  - `powerline`
  - `breadcrumb`
  - `footer`
  - `header`
  - `header-info`
  - Those flags are exposed through Pi's extension API and are also backed by settings files.
2. **Registers a unified `/powerline` slash command**
  - With no arguments, `/powerline` toggles the master on/off switch.
  - `/powerline info` shows the currently merged settings.
  - `/powerline breadcrumb:hide|top|inner` changes breadcrumb placement.
  - `/powerline footer:on|off`, `/powerline header:on|off`, and `/powerline header-info:on|off` toggle the individual UI pieces.
  - Command changes are persisted into the project-level `.pi/settings.json` while preserving unrelated keys.
3. **Replaces Pi's editor component when powerline is enabled**
  - The default editor chrome is swapped for a bordered editor with a `❯` prefix.
  - If the current input starts with `!`, the editor switches to Pi's `bashMode` color tokens.
  - The editor render is width-capped to the live terminal column count so it does not overrun narrow terminals after resizes.
  - If `breadcrumb` is `inner`, the editor's top border embeds a live `model -> folder` breadcrumb.
4. **Optionally adds a breadcrumb widget above the editor**
  - If `breadcrumb` is `top`, the package adds a widget above the editor instead of embedding breadcrumb text into the editor border.
  - That widget shows the current model name and the current working folder.
5. **Replaces Pi's footer**
  - The footer renders context-window usage, token totals, cache reads/writes, cache hit rate, cost, Git branch, current thinking level, and extension status text.
  - It updates during live streaming, not just at turn boundaries.
  - It mirrors Pi's compact footer style rather than introducing a separate multi-row dashboard.
6. **Replaces Pi's startup/reload header**
  - The header shows a centered gradient PI logo and a status line for `startup`, `reload`, `new`, `resume`, or `fork`.
  - If `header-info` is enabled and Pi's `quietStartup` is also enabled, it can additionally render diagnostic sections for context files, packages, tools, skills, prompts, and extensions.
7. **Aggregates subagent usage into the footer**
  - If Pi subagents are present and emitting events, the footer can include subagent token totals and subagent cost totals.
  - Those totals are preserved into the current session as custom entries so they survive resume/reload scenarios.
8. **Uses stale-session-safe snapshots instead of long-lived ctx references**
  - The package snapshots the specific state it needs and clears UI state on shutdown to avoid stale `ExtensionContext` crashes during reload/new/fork/switch-session flows.

## How it interacts with Pi at runtime

This package is intentionally narrow in scope, but it does touch several Pi APIs to keep the UI live and consistent.

### UI surfaces it replaces or augments

- **Editor**: replaced through `ctx.ui.setEditorComponent(...)` when powerline is enabled.
- **Header**: replaced through `ctx.ui.setHeader(...)` when the custom header is enabled.
- **Footer**: replaced through `ctx.ui.setFooter(...)` when the custom footer is enabled.
- **Widget**: added through `ctx.ui.setWidget(...)` when breadcrumb mode is `top`.
- **Notifications**: `/powerline` uses `ctx.ui.notify(...)` to show status, usage help, and toggle confirmations.

### Pi events it listens to

The package reacts to Pi runtime events rather than polling blindly.

- `session_start`: enable the editor/header/footer/widget for the new session when settings allow it.
- `model_select`: refresh breadcrumb/header/footer state when model capabilities or displayed model names change.
- `before_agent_start`: refresh header diagnostic information using Pi's exact system-prompt inputs.
- `thinking_level_select`: keep the footer's thinking-level display in sync.
- `agent_start`, `message_update`, `message_end`, `turn_end`: keep footer token/cost displays live while the agent is streaming and after a turn persists.
- `session_shutdown`: tear down custom UI state so stale contexts are not reused.
- custom `powerline_settings_changed`: re-render immediately after `/powerline` writes settings.
- custom `subagents:started`, `subagents:completed`, `subagents:failed`: update subagent totals in the footer and persist finished subagent usage.

### Pi state it reads

At runtime, the package reads several pieces of Pi state to render the UI accurately:

- current `cwd`
- current model name/id, reasoning support, and context window
- current thinking level
- session entries and persisted assistant usage
- live streaming assistant usage during the current turn
- current context-window usage via `ctx.getContextUsage()`
- Git branch and extension status text from Pi footer data
- active tools, commands, prompts, and skills when rendering header diagnostics
- configured Pi package and extension paths when rendering header diagnostics
- `quietStartup`, `compaction.enabled`, and the powerline-specific settings in Pi settings files

### Files and settings it reads

The package reads, but usually does not write, the following project/user data:

- `~/.pi/agent/settings.json`
- `.pi/settings.json`
- `.pi/APPEND_SYSTEM.md`
- nearby `AGENTS.md` / `CLAUDE.md` files discovered up the directory tree for header diagnostics
- configured Pi package and extension directories when building the header diagnostics view

### What it writes

The package writes in only two cases:

1. **Project powerline settings**
  - `/powerline` updates `.pi/settings.json` in the current project.
  - Unrelated keys are preserved; it does not replace the whole file with powerline-only content.
2. **Custom session entries for subagent usage**
  - The footer persists subagent usage as custom session entries of type `powerline:subagent-usage`.
  - That lets subagent totals survive later `/resume` flows.

## What it changes in output, and what it does not

This is the important boundary if you want to know whether the package is "messing with output."

### It does change

- the **startup/reload header output**
- the **input editor chrome**
- the **breadcrumb display** above or inside the editor
- the **footer display** for usage/cost/context/thinking/Git information
- the **diagnostic output** shown by the header when `header-info` is enabled
- the **UI notification text** produced by `/powerline`

### It does not change

- assistant message content
- user message content
- tool stdout/stderr
- transcript message ordering
- provider/model request payloads
- model selection logic itself
- system prompt content by default
- file edits or tool calls made by Pi

In other words: it changes **presentation and some lightweight settings/session metadata**, not the semantic content of model replies or tool outputs.

## Feature details

### Editor behavior

- Adds top and bottom borders.
- Adds `❯` on the first input line and indentation on following lines.
- Preserves ANSI sequences already present in the underlying editor output.
- Uses Pi theme tokens for border/prefix coloring.
- Switches to bash-mode colors when the prompt starts with `!`.
- Can embed the `model -> folder` breadcrumb into the top border when `breadcrumb` is `inner`.

### Breadcrumb behavior

- Renders the active model name and current folder.
- Uses Nerd Font icons when available, with plain-text fallback otherwise.
- Can be hidden entirely, shown above the editor, or embedded inside the editor border.

### Footer behavior

- Shows current context usage as `used%/window`.
- Shows `(auto)` when Pi compaction is enabled.
- Shows cumulative input/output/cache token usage.
- Shows cache hit rate using prompt-side cache reads.
- Shows model/session cost when available.
- Marks OAuth/subscription-backed cost as `est` to make it clear the value is estimated.
- Shows current Git branch.
- Shows the current thinking level, including Pi's newer `max` level.
- Shows extension status strings that Pi exposes to the footer.
- Tracks subagent token totals and cost totals when subagent events are present.

### Header behavior

- Shows a centered gradient PI logo.
- Shows a status label such as `Welcome`, `Reloaded`, `New Session Started`, `Session Resumed`, or `Session Forked`.
- Can optionally show diagnostic sections for:
  - context files
  - configured packages
  - active tools
  - loaded skills
  - prompt commands
  - extension paths
- Only shows that diagnostics block for `startup` and `reload`, not for `new`, `resume`, or `fork`.
- Normalizes displayed paths to `/` so Windows and Unix output are more consistent.

## Repository-only extras

The published package is the UI extension package above. The repository also carries a few maintainer-only pieces that are useful to know about:

- a committed `.npmrc` that keeps `ignore-scripts=true`
- pinned GitHub Actions workflow dependencies
- Dependabot configuration for npm and GitHub Actions
- CI, CodeQL, and dependency-review workflows
- a protected `main` branch workflow that expects PRs rather than direct pushes
- local `.pi/` development helpers in the repo that are not part of the published package payload

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
| `/powerline` | Toggle the master powerline switch and persist the project setting |
| `/powerline info` | Show the merged current powerline settings |
| `/powerline breadcrumb:top\|inner\|hide` | Change where the model/folder breadcrumb is rendered |
| `/powerline footer:on\|off` | Enable or disable the custom footer |
| `/powerline header:on\|off` | Enable or disable the custom header |
| `/powerline header-info:on\|off` | Enable or disable header diagnostics for startup/reload |

## Development and verification

```bash
npm install --ignore-scripts
npm test
npm run typecheck
npm run lint
npm pack --dry-run
```

This repository intentionally avoids install-time lifecycle hooks. Dependency installs should use `--ignore-scripts`.
The committed `.npmrc` also sets `ignore-scripts=true`, so cloned checkouts stay in no-script mode by default.
Current development and validation targets assume Node.js 22.19+.

This repository includes:

- `tsconfig.check.json`: reproducible TypeScript check configuration
- `semantic-release`: automated release config for GitHub / npm
- `CHANGELOG.md`: explicit fork version history
- `CONTRIBUTING.md`: contributor workflow and release checklist
- `SECURITY.md`: vulnerability reporting and hardening guidance
- `.github/workflows/*`: pinned GitHub Actions CI / CodeQL / dependency-review automation
- `.github/dependabot.yml`: automated dependency update configuration

## Manual publish note

Recommended manual publish flow:

```bash
npm run lint && npm pack --dry-run && npm publish --access public
```

Because this repository commits `.npmrc` with `ignore-scripts=true`, `npm publish` already runs in no-script mode here. Run the validation steps above manually before publishing.

## License

MIT
