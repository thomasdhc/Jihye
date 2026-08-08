# Git Workflow

## Safety and Branching

- Check the current branch and status before changing a repository.
- Ask before moving pre-existing changes between branches. Never stash, reset, discard, or overwrite them without approval.
- Unless the user directs a different base, fetch `origin` and create a focused `<username>/<feature>` branch from the updated `origin/main`, using the branch namespace from workspace-root `USERNAME.md`.
- Never assume local `main` is current, and do not develop directly on `main`.
- If the latest remote `main` cannot be fetched, ask before using another base.
- For parallel or isolated work, use a separate worktree as described in `personas-directory/DEVELOPMENT.md` and keep the canonical checkout untouched.

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

## Merge Requests and Pull Requests

When the user asks to open a merge request or pull request, fetch `origin` and verify whether the current branch exists remotely before claiming that it needs to be pushed. If it exists, create the request directly; otherwise, provide the ready-to-run push command and resume creation after the user confirms the push.

Use Conventional Commit format for every merge request and pull request title: `<type>(<optional-scope>): <message>`. Follow the same type rules as commit messages. Do not use a plain prose title unless the user explicitly requests it.

Before drafting or updating a merge request or pull request description, look for a repository-owned template. If one exists, show its headings and checklists to the user and agree with them how to format the description before proceeding.

When the user asks to add or update a description, update the open MR or PR for the current branch directly with the repository's CLI or API and verify the result. If no open MR or PR exists, or access is unavailable, provide the drafted description and state the limitation. Do not create an MR or PR unless the user asks.

When no repository template exists, use only:

```markdown
## Summary
- <concise change>
- <optional second change>

## Why
<brief motivation or problem being addressed>
```

Keep the summary to one or two concise bullets. Do not add other headings, checklists, validation notes, or supporting sections unless the user explicitly requests them.
