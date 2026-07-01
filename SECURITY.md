# Security policy for `@false00/pi-powerline`

This package customizes the Pi terminal UI, overrides editor/header/footer rendering, and reacts to live session events. It does not manage remote infrastructure directly, but it still runs with the full permissions of the local Pi process.

## Security expectations

- Review the source before installing third-party forks or modified builds
- Do not commit secrets, API keys, tokens, private session transcripts, or private screenshots to this repository
- Keep project-local Pi settings and extension changes under review, since Pi extensions execute with local user permissions
- Treat custom rendering, event hooks, and session-persistence logic as security-sensitive because they can misrepresent state or leak local information into the UI

## Reporting a vulnerability

If you find a security issue, report it privately to the maintainer before opening a public issue.

Current maintainer contact from `package.json`:

- `false00 <jortega@curl.red>`

Please include:

- package version
- Pi version
- Node.js version
- operating system / terminal environment
- affected file path or extension surface
- reproduction steps
- impact assessment
- whether the issue involves stale-session state leakage, unintended file access, misleading UI state, or secret exposure

## Areas of special interest

Security-sensitive areas in this repository include:

- session replacement and reload handling
- persistent session entries and custom extension state
- UI elements that summarize token usage or tool/session state
- any behavior that can make Pi report success when the extension is actually in an invalid state
- any write to project files or Pi config files

## Hardening notes

- The extension now avoids long-lived reads from stale `ExtensionContext` objects after reload/session replacement
- Session-scoped UI state is explicitly cleaned up during `session_shutdown`
- Subagent token aggregation reads from explicit lifecycle data instead of guessing from stale objects
- Package publication is constrained by an explicit `files` allowlist in `package.json`

## Supply-chain guidance

For maintainers and release operators:

- run `npm run lint`
- run `npm pack --dry-run`
- verify published tarball contents before release
- prefer publishing from a clean git checkout
- prefer npm 2FA / web auth over long-lived automation tokens when publishing manually
