# Pi Extensio

Personal Pi extensions and skills packaged for installation across workstations.

## Install / Local Setup

```bash
npm install
pi install .
```

Run `/reload` in any existing Pi session after installing or changing extensions, skills, or agents.

## Development

- Read Pi's extension and package documentation before changing extension APIs or package metadata.
- Use branch workflow for changes: create a branch named `<username>/<feature>`, push it, and open a pull request targeting `main`.
- Use concise conventional-style commit messages:
  - `feat: <summary>` for new behavior or capabilities
  - `fix: <summary>` for bug fixes
  - `docs: <summary>` for documentation-only changes
  - `ci: <summary>` for CI, release, or automation changes
  - Scoped forms are allowed when useful, e.g. `fix(ci): <summary>` or `feat(subagent): <summary>`
- Keep each extension focused and independently testable.
- Keep policy configuration separate from interception logic.
- Prefer narrow, explicit safety rules over broad command classification.
- Add tests for every guarded and unguarded behavior change.
- `npm test` is a hard requirement before handing off code changes.
- Do not mark a change complete unless tests pass.
- If tests cannot be run, clearly state the blocker and treat the change as not ready.
- Never commit credentials, tokens, `.env` files, or workstation-specific settings.

## Layout

- `agents/` — Portable default subagent definitions loaded by the subagent extension.
- `extensions/` — Pi extensions loaded by the package manifest.
- `skills/` — Pi skills loaded by the package manifest.
- `tests/` — Node test-runner coverage for extension logic and event behavior.
