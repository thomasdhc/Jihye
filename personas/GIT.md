# Git Workflow

## Safety and Branching

- Check the current branch and status before changing a repository.
- Ask before moving pre-existing changes between branches. Never stash, reset, discard, or overwrite them without approval.
- Unless the user directs a different base, fetch `origin` and create a focused `<username>/<feature>` branch from the updated `origin/main`, using the branch namespace from workspace-root `USERNAME.md`.
- Never assume local `main` is current, and do not develop directly on `main`.
- If the latest remote `main` cannot be fetched, ask before using another base.
- For parallel or isolated work, use a separate worktree as described in policy-directory `DEVELOPMENT.md` and keep the canonical checkout untouched.

## Staging, Commits, and Pushing

- Validate the change, stage only the task's files, review the staged diff, and commit automatically unless the user asks otherwise.
- Prefer additional follow-up commits over amending existing commits. Amend only when the user explicitly asks.
- Use the applicable commit command configured in workspace-root `USERNAME.md` so required signing and attribution are preserved.
- Never push. Pushing is delegated to the user; provide a ready-to-run push command instead.

## Commit Messages

Use Conventional Commit style:

```text
<type>(<optional-scope>): <message>
```

Supported primary types include:

- `feat`: new behavior or capability
- `fix`: bug fix
- `docs`: documentation-only change
- `ci`: CI or build change

Use another Conventional Commit type only when it describes the change more accurately.

## Merge Request and Pull Request Descriptions

Before drafting a merge request or pull request, look for a repository-owned template. Preserve its required headings and checklists, and fit the summary and motivation into the closest equivalent sections. Do not add duplicate `Summary` or `Why` headings when the template already covers them.

When the user asks to add or update a description, update the open MR or PR for the current branch directly with the repository's CLI or API and verify the result. If no open MR or PR exists, or access is unavailable, provide the drafted description and state the limitation. Do not create an MR or PR unless the user asks.

When no repository template exists, use:

```markdown
## Summary
- <concise change>
- <optional second change>

## Why
<brief motivation or problem being addressed>
```

Keep the summary to one or two concise bullets.
