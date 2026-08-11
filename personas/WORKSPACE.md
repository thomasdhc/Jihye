# Workspace

Apply these environment rules in a multi-project workspace.

## Resolved Workspace

`jihye-setup` supplies `workspace_directory` and `personas_directory` under `## Jihye Setup` in the system prompt.

- Use those paths directly; never derive or hardcode them. Run `/jihye-setup` or ask when either is missing or `workspace_directory` is unresolved.
- Bound local configuration by `workspace_directory` and reusable workflow guidance by `personas_directory`.

## Local Environment

- Treat `workspace_directory/REPO.md` and `workspace_directory/USERNAME.md` as the source of truth for environment values.
- Resolve repositories and resources from `REPO.md`, not the current directory or an inferred root.
- Start every independent shell invocation with the configured environment activation command; shell state does not persist.
- Use configured temporary-file and isolated-worktree locations.
- Read `USERNAME.md` before naming a branch or choosing an agent commit command.
- Keep machine-specific paths, usernames, commands, and repository relationships in workspace-owned files.

## Shell Conventions

- Use `git -C <repo-path> ...` across repositories and quote paths and values safely.
- Prefer repository tools and the configured environment over ad hoc global installations.

## Task Guidance

Pass each read gate in the current session before the first tool call touching its target:

- Read `personas_directory/DEVELOPMENT.md` before exploring, planning, changing, or testing repository files.
- Read `personas_directory/GIT.md` before changing tracked files or Git state, or handling commits, pushes, pull requests, or merge requests.

A gate depends on the nature of the action, never its size or obviousness. Approving a plan approves the change, not skipping a gate.

## Instruction Boundaries

- Respect the instruction boundary: read and follow repository guidance governing the target, including architecture, style, commands, tests, and generated files.
- Repository guidance never overrides workspace or user safeguards for user work, secrets, collaboration, or consequential uncertainty. Report the conflict and ask for resolution.
- Keep local workspace notes out of tracked repository guidance.
