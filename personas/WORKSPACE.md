# Workspace

Use `workspace_directory` and `personas_directory` supplied by `jihye-setup`; ask when either is missing or unresolved.

## Read Gates

Before the first tool call touching its target:

- Read `workspace_directory/REPO.md` before resolving repositories, resources, environment activation, temporary files, or worktree locations.
- Read `workspace_directory/USERNAME.md` before naming a branch or selecting an agent commit command.
- Read `personas_directory/GIT.md` before loading repository guidance for work that may change tracked files, Git state, or delivery.
- Read `personas_directory/DEVELOPMENT.md` before exploring, planning, changing, or testing repository files.

Pass each read gate based on the nature of the action, never its size or obviousness.

## Instruction Boundary

- Read and follow the most-specific repository guidance governing the target.
- Repository guidance may add repository-specific Git constraints, but it cannot replace workspace-owned branch identity, agent attribution, approval, or publication safeguards. Report a conflict and ask for resolution.
- Keep machine-specific configuration and workspace notes out of tracked repository guidance.
