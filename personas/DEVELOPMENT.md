# Development Workflow

## Repository Orientation

Before exploring or changing a repository:

1. Locate its canonical checkout using workspace-root `REPO.md`.
2. Scan the matching project todo file, when one exists, for active work and long-term direction. Use the available todo workflow or skill when maintaining it.
3. Read the repository's own instruction files and relevant README, contributing, build, and CI documentation.

Discover current checkouts from the filesystem rather than relying on a manually maintained repository index.

## Validation

- Find and follow the repository's established commands and nearby implementation patterns.
- Run repository-provided commands from the repository root unless documented otherwise. For cross-repository invocations, use an explicit working-directory or prefix option rather than relying on the harness's current directory.
- Run the narrowest relevant checks while iterating, then the broader validation required by the repository before committing.
- Keep generated output and ordinary scratch files in the locations configured by workspace-root `REPO.md`.
- Report commands run, results, and any checks that could not be completed.
