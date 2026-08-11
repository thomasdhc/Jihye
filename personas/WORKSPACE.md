# Workspace

Use this profile as the standing policy for a multi-project development workspace.

## Resolved Workspace

The `jihye-setup` extension resolves `workspace_directory` and `personas_directory` and states them under `## Jihye Setup` in the system prompt.

- Use those paths directly; do not re-derive, reconstruct, shorten, or hardcode them.
- Run `/jihye-setup` or ask for the missing value when either path is absent or `workspace_directory` is unresolved.
- Treat `workspace_directory` as the boundary for machine- and workspace-specific configuration.
- Treat `personas_directory` as the boundary for reusable workflow guidance.

## Local Environment

- Treat `workspace_directory/REPO.md` and `workspace_directory/USERNAME.md` as the source of truth for environment-specific values.
- Resolve repository and workspace resource paths from `workspace_directory/REPO.md`; do not infer them from the current directory or a repository root.
- Begin each independent shell invocation with the configured environment activation command. Shell state does not persist between tool calls.
- Use the configured locations for temporary files and isolated worktrees.
- Read `workspace_directory/USERNAME.md` before naming a branch or selecting an agent-specific commit command.
- Keep paths, usernames, command aliases, and local repository relationships out of reusable guidance.

### Shell Conventions

- Use `git -C <repo-path> ...` instead of changing directories only to run a cross-repository Git command.
- Quote paths and shell values safely.
- Prefer repository-provided tools and the configured shared environment over ad hoc global installations.
- Never write secrets, credentials, `.env` files, or workstation authentication material into repositories.

## Task Guidance

The reads below are mandatory gates, not references. Pass each read gate in the current session before the first tool call that touches the target.

- Read `personas_directory/DEVELOPMENT.md` before exploring, planning, changing, or testing repository files.
- Read `personas_directory/GIT.md` before changing tracked files or Git state, or handling commits, pushes, pull requests, or merge requests.

Open a read gate based on the nature of the action, never its size or obviousness. Treat user approval as separate from every read gate.

## Instruction Boundaries

- Read the repository's tracked `AGENTS.md` and/or `CLAUDE.md` plus any more-specific guidance that governs the target.
- Follow repository-owned guidance for project-specific architecture, style, commands, testing, and generated files.
- Preserve workspace and user safeguards for collaboration, secrets, and consequential uncertainty when repository guidance conflicts with them; report the conflict and ask for resolution.
- Keep local workspace notes in workspace-owned files. Do not modify tracked repository guidance only to store local preferences.
