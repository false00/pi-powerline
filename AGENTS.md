This is a pi plugin project that provides powerline-style UI extensions: editor, breadcrumb, footer, and header.

## Project structure

```
.
├── AGENTS.md               # Project collaboration rules (this file)
├── README.md               # Installation, usage, and development docs
├── CHANGELOG.md            # Release history
├── LICENSE                 # MIT license
├── package.json            # npm package manifest; the "pi" field points to the extensions directory
├── assets/                 # README and package gallery image assets
├── extensions/             # Standard pi extension directory
│   ├── index.ts            # Single entry point; registers all extensions
│   ├── editor.ts           # Editor extension (PromptPrefixEditor)
│   ├── breadcrumb.ts       # Breadcrumb rendering helpers
│   ├── widget.ts           # Top breadcrumb widget
│   ├── footer.ts           # Footer extension (token stats + git branch)
│   ├── header.ts           # Header extension (gradient PI logo)
│   └── settings.ts         # Settings read/write helpers
├── tests/                  # Unit tests
├── .pi/
│   ├── settings.json       # Project-level pi config
│   ├── APPEND_SYSTEM.md    # Content appended to the system prompt
│   └── extensions/
│       └── auto-format.ts  # Automatically run prettier after editing ts files
├── tsconfig.json           # LSP type resolution (gitignored; each developer creates it for their local pi install path)
└── .gitignore
```

## Architecture

- `extensions/index.ts` is the only pi package entry point, declared in `package.json` as `"pi": { "extensions": ["./extensions"] }`
- Each extension module exports a `registerXxx(pi)` function, and `extensions/index.ts` wires them together
- Small helpers stay inline in each module; shared UI/settings helpers live in `extensions/breadcrumb.ts` and `extensions/settings.ts`

## Tooling

- Runtime originally used **bun** (`bun test`, `bun prettier`)
- `.pi/extensions/auto-format.ts` — automatically runs prettier after `edit`/`write` tool operations on ts files
- `simple-git-hooks` — runs prettier check + tests + commitlint before git commits
- Tests were originally run with `bun test` (compatible with `node:test` syntax)
- Formatting conventions: single quotes, semicolons, trailing commas, 2-space indentation, LF line endings, 100-character width

## Collaboration rules

### Editing

- Documentation should use concise English by default
- Code uses 2-space indentation
- Code comments must be in English
- Keep comments concise
- After editing `.ts` / `.json` files, run three checks:
  1. `bun prettier --write <files>` — formatting
  2. `bun tsc --noEmit --ignoreDeprecations 6.0` — type check
  3. `bun test` — unit tests

### Creating

- Before creating a file, first check whether the target file already exists to avoid duplication or accidental overwrite

### Search

- Do not scan the whole repository by default; read relevant notes and the necessary indexes for the task
- Prefer `rg` (ripgrep) for content search instead of `find` or `grep`
- Prefer `gh` for GitHub repository information
