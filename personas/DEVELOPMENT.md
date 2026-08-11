# Development Workflow

## Repository Orientation Read Gate

Pass this read gate before exploring, planning, changing, or testing repository files:

1. Locate the canonical checkout using workspace-root `REPO.md`.
2. Scan the matching project todo, when one exists, for active work and long-term direction. Load and follow the available todo workflow before maintaining it.
3. Read the repository's instruction files and relevant README, contributing, build, and CI documentation.

Treat configured workspace roots as source-of-truth boundaries. Discover current checkouts within those roots from the filesystem instead of maintaining a reusable repository index.

## Validation

- Find and follow repository-provided commands and nearby implementation patterns.
- Run commands from the repository root unless its documentation directs otherwise.
- Use an explicit working-directory or command prefix for cross-repository invocations.
- Run the narrowest relevant validation while iterating, then every broader check required by repository guidance before handoff.
- Keep generated output and scratch files in locations configured by workspace-root `REPO.md`.
- Report each command run, its result, and every check that could not be completed.
