# Jihye (지혜)

Personal Pi extensions, skills, agents, and reusable guidance packaged for installation across workstations.

## Install / Local Setup

```bash
npm install
pi install .
```

Run `/reload` in any existing Pi session after installing or changing extensions, skills, or agents.

## Development

- Indent TypeScript and JavaScript with tabs, displayed at four columns. Do not replace indentation tabs with spaces; follow `.editorconfig` for formats that require spaces.
- Read Pi's extension and package documentation before changing extension APIs or package metadata.
- Read `GUIDANCE.md` before writing or revising any Markdown guidance under `personas/` or `skills/`; it defines the authoring principles and the shared glossary.
- Use branch workflow for changes: create a branch named `<username>/<feature>`, push it, and open a pull request targeting `main`.
- Use concise conventional-style commit messages:
  - `feat: <summary>` for new behavior or capabilities
  - `fix: <summary>` for bug fixes
  - `docs: <summary>` for documentation-only changes
  - `ci: <summary>` for CI, release, or automation changes
  - Scoped forms are allowed when useful, e.g. `fix(ci): <summary>` or `feat(subagent): <summary>`
- Bump the `package.json` version once per branch, before opening the pull request, sized to the branch's aggregate change against `origin/main` rather than to any single commit. Use `patch` for wording, clarification, and fixes; use `minor` for adding, removing, or renaming a domain, gate, invariant, extension, or skill. Raise an existing unlanded bump when later commits widen the change set.
- Keep each extension focused and independently testable.
- Keep policy configuration separate from interception logic.
- Prefer narrow, explicit safety rules over broad command classification.
- Add tests for every guarded and unguarded behavior change.
- `npm test` is a hard requirement before handing off code changes.
- Do not mark a change complete unless tests pass.
- If tests cannot be run, clearly state the blocker and treat the change as not ready.
- Never commit credentials, tokens, `.env` files, or workstation-specific settings.

## Layout

- `extensions/` — Pi extensions loaded by the package manifest.
- `personas/` — Global and workspace guidance, local-configuration templates, and portable default subagent definitions.
- `skills/` — Pi skills loaded by the package manifest.
- `tests/` — Node test-runner coverage for extension logic and event behavior.
