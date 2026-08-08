# Workspace

This is a multi-project development workspace.

## Workspace Guidance

Locate the workspace `AGENTS.md` loaded by Pi, then run:

```bash
workspace_agents="<absolute-path-to-the-loaded-workspace-AGENTS.md>"
workspace_directory="$(dirname -- "$workspace_agents")"
personas_directory="$(dirname -- "$(readlink -f -- "$workspace_agents")")"
```

These location-resolution commands may run before reading the environment guidance. Do not derive either directory from the current directory or a repository root.

Use each directory for its intended purpose:

In all subsequent commands and file accesses, use the resolved `workspace_directory` and `personas_directory` paths directly; do not reconstruct, shorten, or hardcode them.

- `workspace_directory` contains machine- and workspace-specific configuration.
  - Read `workspace_directory/REPO.md` before resolving or using repository, todo, environment, or temporary paths.
  - Read `workspace_directory/USERNAME.md` before naming a branch or selecting an agent-specific commit command.
- `personas_directory` contains reusable workflow guidance for agents in the workspace.
  - Read `personas_directory/ENVIRONMENT.md` before running any other local command.
  - Read `personas_directory/DEVELOPMENT.md` before exploring, changing, testing, or planning repository code.
  - Read `personas_directory/GIT.md` before changing tracked files or Git state, or handling commits, pushes, pull requests, or merge requests.

Read guidance when it becomes relevant rather than loading every file by default. If required workspace configuration is missing, ask the user instead of guessing.

## Instruction Boundaries

When a task involves a repository, consult its tracked `AGENTS.md` and/or `CLAUDE.md` and any more-specific guidance relevant to the target files. Prefer repository-owned guidance for project-specific commands, architecture, style, testing, and generated files.

Repository guidance does not override safeguards for user work, secrets, collaboration, or consequential uncertainty. Flag conflicts and resolve them with the user.

Keep local workspace notes in workspace-owned files rather than modifying tracked repository guidance solely to store local preferences.
