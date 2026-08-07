# Workspace Repositories

> Replace every `<...>` value with local configuration. Remove optional entries and sections that do not apply.

This is a multi-project workspace for `<workspace-purpose-or-ecosystem>`.

## Paths

- Workspace root and source of truth: `<absolute-workspace-path>`
- Jihye package checkout: `<absolute-jihye-checkout-path>`
- Repository checkouts: `<absolute-repository-checkout-path>`
- Project todos: `<absolute-project-todo-path>`
- Shared development environment: `<absolute-environment-path>`
- Normal repository-local temporary files: `<repo-root>/tmp`
- Parallel and isolated worktrees: `<absolute-worktree-path>`

Activate the shared development environment before running local commands:

```bash
<environment-activation-command>
```

Always resolve workspace files and repositories relative to the workspace root above.

## Layout

| Path | Contents | Entry point |
|---|---|---|
| `<repositories>/` | Repository checkouts | `<repositories>/AGENTS.md` |
| `<todos>/` | Project work items and long-term direction | `<todos>/README.md` |
| `<scripts>/` | Reusable workspace scripts | `<scripts>/AGENTS.md` |
| `<temporary-files>/` | Scratch outputs and isolated worktrees | — |

## Local Repository Relationships

- `<record aliases, mirrors, legacy checkouts, or other relationships the agent should understand>`
