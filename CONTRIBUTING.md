# Contributing to `@false00/pi-powerline`

Thanks for contributing.

This package changes Pi's interactive UI, so correctness, safe lifecycle handling, and honest documentation matter more than cleverness.

## Principles

- Prefer correctness over convenience
- Prefer explicit state over hidden magic
- Keep docs aligned with shipped behavior
- Treat session replacement, reload, and background/subagent state as high-risk areas
- Do not guess about Pi extension behavior; verify it against code and documentation

## Repository layout

```text
extensions/     Runtime extension source
assets/         README/package preview assets
tests/          Unit tests
.github/        CI and security workflows
README.md       User-facing documentation
AGENTS.md       Maintainer/agent operating guide
SECURITY.md     Vulnerability reporting and security policy
CHANGELOG.md    Release history
```

## Local development

Requirements:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install --ignore-scripts
```

This repository does not rely on install-time lifecycle hooks. The committed `.npmrc` keeps installs in `ignore-scripts` mode by default.

Run the standard checks:

```bash
npm run format:check
npm run typecheck
npm test
npm run lint
```

Check the publishable package:

```bash
npm pack --dry-run
```

## Change checklist

Before opening a PR or publishing a release:

1. Update runtime code in `extensions/`
2. Update `README.md` for user-visible behavior changes
3. Update `CHANGELOG.md` for release-visible changes
4. Update `AGENTS.md` if maintainer/agent expectations changed
5. Add or update tests when behavior changes
6. Run `npm run lint`
7. Run `npm pack --dry-run` if packaging or metadata changed
8. Review `SECURITY.md` if the change affects lifecycle, persistence, or local file access

## Testing expectations

- New or changed features should include tests when practical
- Bugs around lifecycle state should include regression coverage when possible
- Do not add tests that require private credentials or unpublished secrets
- Keep tests deterministic and fast enough for routine pre-commit use

## Release policy

Maintainers should not publish blindly.

Recommended manual release flow:

```bash
npm run lint
npm pack --dry-run
npm publish --access public
```

Because this repository commits `.npmrc` with `ignore-scripts=true`, publishing stays in no-script mode by default. Run the validation steps above manually before publishing.
