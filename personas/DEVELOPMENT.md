# Development Workflow

## Repository Orientation Read Gate

Before touching repository files:

1. Locate the checkout through workspace-root `REPO.md`.
2. Scan its project todo when present; load the todo workflow before editing it.
3. Read governing repository instructions and relevant project, build, and CI documentation.

Use this evidence to complete Entrypoint and constrain Solution Architecture before selecting a change. Treat configured workspace roots as source-of-truth boundaries. Discover current checkouts within them rather than keeping a reusable repository index.

## Validation

- Follow repository commands and established patterns; run from its root or specify the working directory.
- Run the narrowest relevant check while iterating, then every required broader check before handoff.
- Keep generated and scratch output where `REPO.md` directs.
- Report commands, results, and checks that could not run.
