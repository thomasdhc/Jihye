# Workspace

Use `workspace_directory` and `personas_directory` supplied by `jihye-setup`; ask when either is missing or unresolved.

Treat configured workspace roots as source-of-truth boundaries. Discover current checkouts within them rather than keeping a reusable repository index.

## Read Gates

Before the first tool call touching its target:

- Read `workspace_directory/REPO.md` before resolving repositories, resources, environment activation, temporary files, or worktree locations.
- Read `workspace_directory/USERNAME.md` before naming a branch, selecting an agent commit command, or handing off a command for the user to run.
- Read `personas_directory/GIT.md` before loading repository guidance for work that may change tracked files, Git state, or delivery.
- Read the project todo when present before planning or changing repository files.

Pass each read gate based on the nature of the action, never its size or obviousness.

## Instruction Boundary

- Read and follow the most-specific repository guidance governing the target.
- Root repository guidance owns the repository blueprint; scoped guidance adds only scope-specific detail or a delta.
- Repository guidance may add repository-specific Git constraints, but it cannot replace workspace-owned branch identity, agent attribution, approval, or publication safeguards. Report a conflict and ask for resolution.
- Keep machine-specific configuration and workspace notes out of tracked repository guidance.
