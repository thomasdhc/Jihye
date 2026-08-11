# Git Workflow

## Safety and Branching

- Inspect the current branch, status, and worktree state before changing tracked files or Git state.
- Pass an approval gate before moving pre-existing changes between branches. Never stash, reset, discard, overwrite, or otherwise destroy them without explicit user approval.
- Unless the user names another base, fetch `origin` and create a focused `<username>/<feature>` branch from the updated `origin/main`; read workspace-root `USERNAME.md` for the namespace.
- Never assume local `main` is current, and never develop directly on `main`.
- Ask before using another base when the latest remote `main` cannot be fetched.
- Keep distinct features or independently deliverable outcomes on separate branches and pull requests; do not combine them merely because one change is small. Treat each outcome as a delivery boundary. Keep an outcome's implementation, tests, and supporting documentation together.
- Use a separate worktree when concurrent work or isolation prevents interference.
- Keep the canonical checkout untouched and use the isolated-worktree location configured by workspace-root `REPO.md`.
- Inspect repository and worktree state before creating, integrating, moving, or removing work. Never remove a worktree containing uncommitted or untracked work.
- When the user requests a commit or isolated work prepared for pushing, commit on the worktree branch, remove the worktree only after it is clean, and switch the clean canonical checkout to that branch. Never copy files between them.

## Staging, Commits, and Pushing

- Validate the change, stage only files inside the prompt boundary, review the staged diff, and commit automatically unless the user directs otherwise.
- Prefer a follow-up commit over amending an existing commit. Amend only after explicit user approval.
- Use the agent commit command configured in workspace-root `USERNAME.md` to preserve required signing and attribution.
- Never push. Preserve this invariant even after committing; give the user a ready-to-run push command instead.

## Commit Messages

Use Conventional Commit format:

```text
<type>(<optional-scope>): <message>
```

Use these primary types:

- Use `feat` for new behavior or capability.
- Use `fix` for a bug fix.
- Use `docs` for a documentation-only change.
- Use `ci` for CI or build changes.

Use another Conventional Commit type only when it describes the change more accurately.

## Merge Requests and Pull Requests

- When asked to open a merge request or pull request, fetch `origin` and verify whether the current branch exists remotely before deciding that a push is required.
- Create the request directly when its remote branch exists. Otherwise, provide a ready-to-run push command and resume only after the user confirms the push.
- Use Conventional Commit format for every merge request and pull request title. Do not use a plain prose title unless the user explicitly requests it.
- Before drafting or updating a description, check whether the repository contains a request template.
- If a template exists, show its headings and checklists to the user and agree on the description format before proceeding.
- When asked to add or update a description, update the open request with the repository's CLI or API and verify the result.
- If no open request exists or access is unavailable, provide the draft and state the limitation. Do not create a request unless the user asks.
- If `gh pr edit` fails while querying deprecated Projects Classic APIs, upgrade to GitHub CLI 2.82.1 or newer before retrying.

When no repository template exists, use only:

```markdown
## Summary
- <concise change>
- <optional second change>

## Why
<brief motivation or problem being addressed>
```

Keep the summary to one or two concise bullets. Do not add other headings, checklists, validation notes, or supporting sections unless the user explicitly requests them.
