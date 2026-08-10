# Git Workflow

## Safety and Branching

- Check the current branch and status before changing a repository.
- Ask before moving pre-existing changes between branches. Never stash, reset, discard, or overwrite them without approval.
- Unless the user directs a different base, fetch `origin` and create a focused `<username>/<feature>` branch from the updated `origin/main`, using the branch namespace from workspace-root `USERNAME.md`.
- Never assume local `main` is current, and do not develop directly on `main`.
- If the latest remote `main` cannot be fetched, ask before using another base.
- Use a separate Git worktree when concurrent work or isolation would prevent interference with the canonical checkout.
- Keep the canonical checkout untouched and use the isolated-worktree location configured in workspace-root `REPO.md`.
- Inspect repository and worktree state before creating, integrating, moving, or removing work. Never stash, reset, overwrite, or discard existing changes, and never remove a worktree containing uncommitted or untracked work.
- When the user asks to commit or prepare isolated work for pushing, commit it on its branch in the worktree, then remove the clean worktree and switch the clean canonical checkout to that branch; the repository is shared, so never copy files between them.

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

Before drafting or updating a merge request or pull request description, look for a repository-owned template. Check that candidate template files or directories exist before reading or searching them. If one exists, show its headings and checklists to the user and agree with them how to format the description before proceeding.

When the user asks to add or update a description, update the open MR or PR for the current branch directly with the repository's CLI or API and verify the result. If no open MR or PR exists, or access is unavailable, provide the drafted description and state the limitation. Do not create an MR or PR unless the user asks.

`gh pr edit` itself is not deprecated, but GitHub CLI versions before 2.82.1 may fail while querying deprecated Projects Classic APIs. Upgrade to `gh` 2.82.1 or newer. If upgrading is not immediately possible, update an existing PR body without that query and verify it with a separate GET:

```bash
gh api --method PATCH "repos/{owner}/{repo}/pulls/{number}" --field body=@- < "$body_file"
gh api --method GET "repos/{owner}/{repo}/pulls/{number}" --jq .body
```

When no repository template exists, use only:

```markdown
## Summary
- <concise change>
- <optional second change>

## Why
<brief motivation or problem being addressed>
```

Keep the summary to one or two concise bullets. Do not add other headings, checklists, validation notes, or supporting sections unless the user explicitly requests them.
