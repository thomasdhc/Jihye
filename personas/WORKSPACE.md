# Workspace

This is a multi-project development workspace.

## Guidance Locations

This profile is intended to be installed as the workspace-root `AGENTS.md` through a symlink.

Keep the workspace context's symlink path and canonical target distinct:

- Locate the workspace `AGENTS.md` loaded from the active workspace; do not substitute the global `AGENTS.md` or an instruction source path shown by the agent harness.
- Set the workspace root to the directory containing that symlink **before** resolving it.
- Resolve that exact symlink, then set the reusable policy directory to the canonical target's directory.
- Read local configuration from the workspace root and reusable workflow policy from the policy directory.
- Do not look for policy files beside the unresolved symlink merely because it is the loaded context path.

## Workspace Context

Read guidance when it becomes relevant rather than loading every file by default:

- Read workspace-root `REPO.md` before resolving or using workspace-specific paths, repositories, todo files, environments, or temporary locations.
- Read policy-directory `ENVIRONMENT.md` before running local commands or using the workspace's development environment.
- Read policy-directory `DEVELOPMENT.md` before exploring, changing, or testing repository code, or planning repository implementation work.
- Read workspace-root `USERNAME.md` before naming a branch or selecting an agent-specific commit command.
- Read policy-directory `GIT.md` before changing tracked repository files, changing Git state, staging or committing work, pushing, or handling a merge or pull request.

When a task spans several areas, read all guidance relevant to those areas. Do not guess values that belong in workspace-root `REPO.md` or `USERNAME.md`; if a needed value is missing, ask for it before proceeding.

## Instruction Boundaries

When a task involves a repository, consult its tracked `AGENTS.md` and/or `CLAUDE.md` and any more-specific guidance relevant to the target files. Prefer repository-owned guidance for project-specific commands, architecture, style, testing, and generated files.

Treat that preference as strong context, not an instruction to silently violate fundamental agent or workspace principles. If repository guidance appears to conflict with preserving user work, protecting secrets, collaborating with the user, resolving consequential uncertainty, or another foundational safety rule, flag the conflict and work with the user to reconcile it before proceeding.

Keep local workspace notes in workspace-owned files rather than modifying tracked repository guidance solely to store local preferences.
