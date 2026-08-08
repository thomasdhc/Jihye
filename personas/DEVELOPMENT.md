# Development Workflow

## Repository Orientation

Before exploring or changing a repository:

1. Locate its canonical checkout using workspace-root `REPO.md`.
2. Check its current branch and status.
3. Scan the matching project todo file, when one exists, for active work and long-term direction. Use the available todo workflow or skill when maintaining it.
4. Read the repository's own instruction files and relevant README, contributing, build, and CI documentation.

Discover current checkouts from the filesystem rather than relying on a manually maintained repository index.

## Validation

- Find and follow the repository's established commands and nearby implementation patterns.
- Run the narrowest relevant checks while iterating, then the broader validation required by the repository before committing.
- Keep generated output and ordinary scratch files in the locations configured by workspace-root `REPO.md`.
- Report commands run, results, and any checks that could not be completed.

## Parallel and Isolated Work

- Use a separate Git worktree when concurrent work or isolation would prevent interference with the canonical checkout.
- Keep the canonical checkout untouched and use the isolated-worktree location configured in workspace-root `REPO.md`.
- Inspect repository and worktree state before creating, integrating, moving, or removing work. Never stash, reset, overwrite, or discard existing changes, and never remove a worktree containing uncommitted or untracked work.
- Follow `ENVIRONMENT.md` for commands and filesystem locations, and `GIT.md` for branching, validation, commits, and pushing.
