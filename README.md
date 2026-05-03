# pi-powerline

Powerline-style UI extensions for [pi](https://github.com/badlogic/pi-mono) coding agent: custom editor, footer, and header.

## Features

**Custom editor** — Replaces the default editor with a bordered input area using a `❯` prompt prefix. Switches to bash-mode coloring automatically when the prompt starts with `!`.

**Custom footer** — A compact status bar showing token usage (`↑input ↓output`), session cost, active model, and current git branch.

**Custom header** — A gradient-colored ASCII PI logo rendered with ANSI 256-color codes, replacing the built-in header and keybinding hints.

## Installation

### Local development

Clone the repository and use pi's `--extension` flag:

```bash
git clone <repo-url> pi-powerline
cd pi-powerline
pi -e ./index.ts
```

Or add it to your project's `.pi/settings.json`:

```json
{
  "extensions": ["./index.ts"]
}
```

### From npm (after publishing)

```bash
pi install npm:pi-powerline
```

Restart pi to activate.

## Usage

All three extensions activate automatically on session start. Each can be toggled via flags or commands:

| Extension | Flag (settings.json) | Command |
|-----------|---------------------|---------|
| Editor    | `customEditor` (default: `true`) | — |
| Footer    | `customFooter` (default: `true`) | `/footer` toggle |
| Header    | `customHeader` (default: `true`) | `/builtin-header` restore default |

### Settings

Disable individual extensions in `.pi/settings.json`:

```json
{
  "customEditor": false,
  "customFooter": true,
  "customHeader": true
}
```

### Commands

| Command | Description |
|---------|-------------|
| `/footer` | Toggle custom footer on/off |
| `/builtin-header` | Restore the built-in header |

## Development

### Project structure

```
.
├── index.ts              # Single entry point (default export)
├── editor.ts             # Editor module → registerEditor()
├── footer.ts             # Footer module → registerFooter()
├── header.ts             # Header module → registerHeader()
├── tests/
│   ├── editor.test.ts
│   ├── footer.test.ts
│   └── header.test.ts
├── .pi/
│   ├── settings.json
│   ├── APPEND_SYSTEM.md
│   └── extensions/
│       └── auto-format.ts  # Auto prettier on edit/write
├── .husky/
│   └── pre-commit          # prettier check + bun test
├── .editorconfig
├── .prettierrc
├── .prettierignore
├── package.json
└── tsconfig.json           # gitignored
```

### Architecture

`index.ts` is the single entry point registered in `package.json` → `"pi": { "extensions": ["./index.ts"] }`. It imports and calls three registration functions:

```ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerHeader } from './header.ts';

export default function (pi: ExtensionAPI) {
  registerEditor(pi);
  registerFooter(pi);
  registerHeader(pi);
}
```

Each module (`editor.ts`, `footer.ts`, `header.ts`) exports a `registerXxx(pi: ExtensionAPI)` function that subscribes to pi lifecycle events and registers flags/commands.

### Code quality

- **Formatting**: `.pi/extensions/auto-format.ts` runs prettier automatically after edit/write tools touch `.ts` files. Prettier config: single quotes, semicolons, trailing commas, 2-space indent, 100 char width.
- **Pre-commit**: `.husky/pre-commit` runs `prettier --check` + `bun test` before every commit.
- Use `bun run format` to format all files, `bun run format:check` to verify.

### Editor setup

Neovim's tsserver can't resolve `@mariozechner/pi-*` imports because those packages are bundled inside pi, not in `node_modules`. Create a `tsconfig.json` with path mappings pointing to the global pi installation:

```bash
# Find the pi install path
ls -d $(dirname $(which pi))/../lib/node_modules/@mariozechner/pi-coding-agent
```

Then copy the example below and adjust paths to match your system:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@mariozechner/pi-coding-agent": [
        "/path/to/.nvm/versions/node/vXX/lib/node_modules/@mariozechner/pi-coding-agent/dist"
      ],
      "@mariozechner/pi-ai": [
        "/path/to/.nvm/.../pi-coding-agent/node_modules/@mariozechner/pi-ai/dist"
      ],
      "@mariozechner/pi-tui": [
        "/path/to/.nvm/.../pi-coding-agent/node_modules/@mariozechner/pi-tui/dist"
      ]
    }
  },
  "include": ["*.ts", "tests/**/*.ts"]
}
```

`tsconfig.json` is gitignored — each developer creates their own.

### Running tests

```bash
bun test
# or via npm:
npm run test:bun
```

Tests use bun's built-in test runner (compatible with `node:test`). Run `bun run test` for the Node.js variant.

### Testing a single extension

```bash
pi -e ./index.ts
```

Then verify each extension:
- Editor: type text → should see `❯` prefix with top/bottom borders
- Footer: check bottom bar → should show model name, token stats, git branch
- Header: startup screen → should show gradient-colored PI logo

## License

MIT
