# Git Workflow

## Safety and Branching

- Inspect branch, status, and worktrees before changing tracked files or Git state.
- Pass an approval gate before moving pre-existing changes between branches. Never stash, reset, rebase, discard, overwrite, or destroy them without explicit approval.
- Unless the user names a base, fetch `origin` and branch from updated `origin/main` as `<username>/<feature>` using workspace-root `USERNAME.md`.
- Never develop on `main` or assume local `main` is current. Ask before another base when `origin/main` cannot be fetched.
- Give each independently deliverable outcome a delivery boundary, keeping its implementation, tests, and supporting documentation together.
- Use a configured isolated worktree when concurrency or isolation requires it; keep the canonical checkout untouched.
- Inspect state before creating, integrating, moving, or removing worktrees. Never remove one with uncommitted or untracked files.
- Keep isolated work in its worktree through delivery when moving it would disturb another delivery boundary. Otherwise, prepare it for pushing by committing in the worktree, removing the clean worktree, and switching the clean canonical checkout to that branch. Never copy files between them.
- Reconcile registered worktrees and the configured worktree root before creating another worktree and after a branch is known to be merged or abandoned. Report cleanup candidates and ask before removal or pruning; never infer staleness from age alone.

## Staging, Commits, and Pushing

- Pass Validation, stage only prompt-boundary files, review the staged diff, and commit unless directed otherwise.
- Prefer a follow-up commit; amend only with explicit approval.
- Use the agent commit command from workspace-root `USERNAME.md`.
- Never push. Provide a ready-to-run push command.

## Commit Messages

Use Conventional Commit format: `<type>(<optional-scope>): <message>`.

Use `feat` for capabilities, `fix` for bugs, `docs` for documentation, and `ci` for automation; use another type only when more accurate.

## Merge Requests and Pull Requests

- Fetch `origin` and check whether the branch exists remotely before deciding a push is required.
- Create a requested merge or pull request only for an existing remote branch; otherwise provide a push command and wait.
- Use Conventional Commit request titles unless the user explicitly requests otherwise.
- Check for a request template before drafting or updating a description. Show its headings and checklists and agree on the format first.
- Update an existing request only when asked, using the repository CLI or API, then verify it. If none exists or access is unavailable, provide a draft and state the limitation.

Without a repository template, use only:

```markdown
## Summary
- <concise change>
- <optional second change>

## Why
<brief motivation>
```

Keep the summary to one or two bullets. Add nothing else unless explicitly requested.
