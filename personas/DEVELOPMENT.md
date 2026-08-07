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

Use an isolated Git worktree when the user explicitly requests parallel or isolated changes. The worktree is a review workspace; the canonical checkout remains untouched until the user explicitly asks to move the approved branch there. Ordinary single-task work and read-only investigation may use the canonical checkout unless isolation is requested.

### Create the review worktree

- Record the canonical checkout's branch, status, and current commit. Scan the project todo file as usual.
- If the canonical checkout has tracked or untracked changes, ask whether the task depends on that local state. Never stash, reset, or copy local changes without approval.
- Unless the user directs a different base, fetch `origin`, record the updated `origin/main` commit as the review base, and create a detached worktree under the isolated-worktree root configured in workspace-root `REPO.md`:

  ```bash
  git -C <canonical-repo> worktree add --detach <worktree-path> <base-sha>
  ```

- If the latest remote `main` cannot be fetched, ask before using another base.
- Keep the review worktree detached initially so no feature branch is occupied before the user approves the work.
- Prefer a worktree over copying or cloning the repository. Fall back only when worktrees cannot support the task, and explain why.
- Perform all edits, generated outputs, and tests inside the worktree. Apply the command-environment rules from `ENVIRONMENT.md` there as well.
- Do not commit, push, or modify the canonical checkout while the work is awaiting review.

### Review

- Return with the worktree path, base commit, changed-file summary, validation performed, test results, and unresolved concerns.
- Keep the detached worktree intact so the user can request revisions or approve the work.
- Wait for explicit user approval before attaching the worktree to a branch, staging, or committing its changes.

### Attach approved work to a branch

When the user approves keeping the reviewed work on a branch but has not yet asked for a commit:

1. Recheck the canonical checkout and review worktree branches, statuses, and commits. If either has unexpected changes, stop and ask how to proceed.
2. Fetch `origin` and confirm that the agreed `<username>/<feature>` branch does not already exist locally or remotely.
3. Create that branch at the review base in the review worktree. Leave the approved changes unstaged and uncommitted.
4. Report the worktree path, branch, base commit, and status. Keep the worktree intact and the canonical checkout untouched.

### Commit approved work in the review worktree

When the user approves the reviewed changes for commit:

1. Recheck the canonical checkout and review worktree branches, statuses, and commits. If either has unexpected changes, stop and ask how to proceed.
2. Fetch `origin` and record the updated `origin/main`. If the review worktree is still detached, attach it to the agreed `<username>/<feature>` branch; if it is already branch-attached, verify that it is the agreed branch. Stop if the branch exists in another worktree or has an unexpected remote counterpart.
3. Stage only the approved files, review the staged diff, and run the required validation.
4. Commit in the review worktree using the configured commit command and required message format. Do not amend unless the user explicitly asks.
5. If `origin/main` advanced after the review began, rebase the committed branch onto the updated base before integration. Stop and ask if it does not rebase cleanly, and rerun validation after a successful rebase.
6. Report the worktree path, branch, final commit, validation results, and ready-to-run push command. Never push.

Keep the canonical checkout untouched and retain the review worktree until the user explicitly asks to move the committed branch into the canonical checkout.

### Move the committed branch into the canonical checkout

When the user asks to move the approved branch out of its review worktree:

1. Recheck that the canonical checkout has no tracked or untracked changes and has not moved unexpectedly. Stop and ask if it has.
2. Fetch `origin` again. If `origin/main` advanced and the branch has not been pushed, rebase and revalidate it in the review worktree before moving it. If the branch was already pushed, ask before rewriting it.
3. Verify that the review worktree is clean and that all approved work is committed. Never remove a worktree containing uncommitted or untracked work. Note any ignored generated files that removal will delete.
4. Unlock the review worktree if needed, remove it with `git worktree remove`, and switch the canonical checkout to the existing `<username>/<feature>` branch. The shared Git branch preserves the commit; no patch or file copy is needed.
5. Verify the canonical branch, commit, clean status, and worktree registry.
6. Report the canonical path, branch, commit, validation results, and ready-to-run push command. Never push.

Do not remove a review worktree merely because review is complete; removal requires the user's explicit request to move or discard it.
