# Workspace Repositories

> Replace every `<...>` value with local configuration. Remove optional entries and sections that do not apply.

This is a multi-project workspace for `<workspace-purpose-or-ecosystem>`.

Keep machine- and workspace-specific repository facts in this file. Do not move them into reusable guidance.

## Paths

- Workspace root and source of truth: `<absolute-workspace-path>`
- Jihye package checkout: `<absolute-jihye-checkout-path>`
- Repository checkouts: `<absolute-repository-checkout-path>`
- Project todos: `<absolute-project-todo-path>`
- Shared development environment: `<absolute-environment-path>`
- Normal repository-local temporary files: `<repo-root>/tmp`
- Parallel and isolated worktrees: `<absolute-worktree-path>`

Begin each independent shell invocation with this environment activation command:

```bash
<environment-activation-command>
```

Resolve workspace files and repositories from the configured workspace root. Discover current checkouts within the configured repository roots instead of recording a reusable repository index.

## Layout

| Path | Contents | Entry point |
|---|---|---|
| `<repositories>/` | Repository checkouts | `<repositories>/AGENTS.md` |
| `<todos>/` | Project work and long-term direction | `<todos>/README.md` |
| `<scripts>/` | Reusable workspace scripts | `<scripts>/AGENTS.md` |
| `<temporary-files>/` | Scratch output and isolated worktrees | — |

## Local Repository Relationships

- `<record aliases, mirrors, legacy checkouts, or other relationships the agent must understand>`
