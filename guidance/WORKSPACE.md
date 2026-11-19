# Workspace

Use `workspace_directory` and `guidance_directory` supplied by `jihye-setup`; ask when either is missing or unresolved.

Treat configured workspace roots as source-of-truth boundaries. Discover current checkouts within them rather than keeping a reusable repository index.

## Read Gates

Pass each read gate before the first tool call touching its target:

- `workspace_directory/REPO.md` gates resolving repositories, resources, environment activation, temporary files, or worktree locations.
- `workspace_directory/USERNAME.md` gates naming a branch, selecting an agent commit command, or handing off a command for the user to run.
- `guidance_directory/GIT.md` gates loading repository guidance for work that may change tracked files, Git state, or delivery.
- The project todo, when present, gates planning or changing repository files.

A read gate opens on the nature of the action, never its size or obviousness.

After compaction, re-pass a read gate only when its guidance still applies, before the next action that guidance governs.

## Instruction Boundary

- Read and follow the most-specific repository guidance governing the target.
- Root repository guidance owns the repository blueprint; scoped guidance adds only scope-specific detail or a delta.
- Repository guidance may add repository-specific Git constraints, but it cannot replace workspace-owned branch identity, agent attribution, approval, or publication safeguards. Report a conflict and ask for resolution.
- Keep machine-specific configuration and workspace notes in workspace-owned files.
