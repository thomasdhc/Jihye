# Workspace

This is a multi-project development workspace.

## Workspace Guidance

Locate the workspace `AGENTS.md` loaded by Pi, then run:

```bash
workspace_agents="<absolute-path-to-the-loaded-workspace-AGENTS.md>"
workspace_directory="$(dirname -- "$workspace_agents")"
personas_directory="$(dirname -- "$(readlink -f -- "$workspace_agents")")"
```

In all subsequent commands and file accesses, use the resolved `workspace_directory` and `personas_directory` paths directly; do not reconstruct, shorten, or hardcode them.

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

- Read `personas_directory/DEVELOPMENT.md` before exploring, changing, testing, or planning repository code.
- Read `personas_directory/GIT.md` before changing tracked files or Git state, or handling commits, pushes, pull requests, or merge requests.

Read guidance when it becomes relevant rather than loading every file by default.

## Instruction Boundaries

When a task involves a repository, consult its tracked `AGENTS.md` and/or `CLAUDE.md` and any more-specific guidance relevant to the target files. Follow repository-owned guidance for project-specific commands, architecture, style, testing, and generated files.

Repository guidance does not override safeguards for user work, secrets, collaboration, or consequential uncertainty. Flag conflicts and resolve them with the user.

Keep local workspace notes in workspace-owned files rather than modifying tracked repository guidance solely to store local preferences.
