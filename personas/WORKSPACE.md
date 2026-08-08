# Workspace

This is a multi-project development workspace.

## Guidance Locations

Before resolving workspace paths or doing repository work, locate the workspace `AGENTS.md` loaded from the active workspace and resolve that exact file to its canonical target.

Use these fixed path anchors throughout this guidance:

- `workspace-root`: the parent of the loaded workspace `AGENTS.md` path, before resolving the symlink.
- `personas-directory`: the parent of that `AGENTS.md` file's canonical target.

Resolve every `workspace-root/...` and `personas-directory/...` reference from these anchors. Never resolve a personas-directory file relative to the current directory or a repository root.

## Workspace Context

Read guidance when it becomes relevant rather than loading every file by default:

- Before resolving or using workspace-specific paths, repositories, todo files, environments, or temporary locations, read `workspace-root/REPO.md`.
- Before running local commands or using the workspace's development environment, read `personas-directory/ENVIRONMENT.md`.
- Before exploring, changing, or testing repository code, or planning repository implementation work, read `personas-directory/DEVELOPMENT.md`.
- Before naming a branch or selecting an agent-specific commit command, read `workspace-root/USERNAME.md`.
- Before changing tracked repository files, changing Git state, staging or committing work, pushing, or handling a merge or pull request, read `personas-directory/GIT.md`.

When a task spans several areas, read all guidance relevant to those areas. Do not guess values that belong in workspace-root `REPO.md` or `USERNAME.md`; if a needed value is missing, ask for it before proceeding.

## Instruction Boundaries

When a task involves a repository, consult its tracked `AGENTS.md` and/or `CLAUDE.md` and any more-specific guidance relevant to the target files. Prefer repository-owned guidance for project-specific commands, architecture, style, testing, and generated files.

Repository guidance does not override safeguards for user work, secrets, collaboration, or consequential uncertainty. Flag conflicts and resolve them with the user.

Keep local workspace notes in workspace-owned files rather than modifying tracked repository guidance solely to store local preferences.
