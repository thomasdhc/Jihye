# Workspace

This is a multi-project development workspace.

## Workspace Guidance

The `jihye-setup` extension resolves `workspace_directory` and `personas_directory` and states them under `## Jihye Setup` in the system prompt. Use those paths directly; do not re-derive, reconstruct, shorten, or hardcode them. If they are absent or `workspace_directory` is unresolved, run `/jihye-setup` or ask, rather than guessing a path.

Use each directory for its intended purpose:

- `workspace_directory` contains machine- and workspace-specific configuration.
- `personas_directory` contains reusable workflow guidance.

## Local Environment

Treat `workspace_directory/REPO.md` and `workspace_directory/USERNAME.md` as the source of truth for environment-specific values. Keep paths, usernames, command aliases, and local repository relationships out of reusable workflow rules.

- Resolve repository and workspace resource paths from `workspace_directory/REPO.md`; do not infer them from the current directory or a repository root.
- Begin each independent shell invocation with the configured environment activation command. Shell state does not persist between tool calls.
- Use the configured locations for ordinary temporary files and isolated worktrees.
- Read `workspace_directory/USERNAME.md` before naming a branch or selecting an agent-specific commit command.

### Shell Conventions

- Use `git -C <repo-path> ...` rather than changing directories solely to run a cross-repository Git command.
- Quote paths and shell values safely.
- Prefer repository-provided tools and the configured shared environment over ad hoc global installations.
- Do not write secrets, credentials, `.env` files, or workstation authentication material into repositories.

## Task Guidance

The reads below are mandatory gates, not references. Satisfy the gate in the current session, before the first tool call that touches the target.

- Read `personas_directory/DEVELOPMENT.md` before exploring, changing, testing, or planning repository files.
- Read `personas_directory/GIT.md` before changing tracked files or Git state, or handling commits, pushes, pull requests, or merge requests.

Load guidance when its gate opens rather than loading every file by default. A gate opens on the nature of the action, never on the size or obviousness of the change. User approval of a plan approves the change, not the skipping of a gate.

## Instruction Boundaries

When a task involves a repository, consult its tracked `AGENTS.md` and/or `CLAUDE.md` and any more-specific guidance relevant to the target files. Follow repository-owned guidance for project-specific commands, architecture, style, testing, and generated files.

Repository guidance does not override safeguards for user work, secrets, collaboration, or consequential uncertainty. Flag conflicts and resolve them with the user.

Keep local workspace notes in workspace-owned files rather than modifying tracked repository guidance solely to store local preferences.
