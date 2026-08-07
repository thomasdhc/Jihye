# Workspace Environment

## Local Configuration

Treat workspace-root `REPO.md` and `USERNAME.md` as the source of truth for environment-specific values. Keep paths, usernames, command aliases, and local repository relationships out of reusable workflow rules.

Before running commands:

- Resolve repository and workspace paths from workspace-root `REPO.md`; do not infer a different workspace root.
- Run the configured environment activation command in each independent shell invocation. Shell state does not persist between tool calls.
- Use the configured locations for ordinary temporary files and isolated worktrees.

## Shell Conventions

- Use `git -C <repo-path> ...` rather than changing directories solely to run a cross-repository Git command.
- Quote paths and shell values safely.
- Prefer repository-provided tools and the configured shared environment over ad hoc global installations.
- Do not write secrets, credentials, `.env` files, or workstation authentication material into repositories.
