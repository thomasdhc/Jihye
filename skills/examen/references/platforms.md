# Hosting Platform Submission Reference

Read this only when preparing or performing an authorized submission. Platform APIs and self-managed versions vary; inspect current metadata and authoritative documentation when capability is uncertain.

## Submitted Review Body

Use exactly:

```markdown
<verdict>

### Review notes
- <concise verified behavior note>
- <concise verified behavior note>
```

Replace `<verdict>` with `LGTM.`, `Review completed.`, `Changes requested.`, or an equivalent concise verdict. Include exactly two behavior-focused notes. Exclude findings, greetings, agent announcements, SHAs, file counts, commands, evidence limitations, and CI status. Submit findings inline in the format required by the skill.

## GitHub Pull Requests

Snapshot the pull request with `GET /repos/{owner}/{repo}/pulls/{pull_number}` and preserve `head.sha`. A review's `commit_id` attaches it to a revision but is not a compare-and-swap guard, so re-read `head.sha` before submission.

Create one review with `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`:

- `commit_id`: reviewed head SHA
- `body`: submitted review body
- `event`: `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`
- `comments[]`: `path`, `body`, `line`, `side`, and optional multiline coordinates

Use `side: RIGHT` for head-side added/context lines and `side: LEFT` for deleted base lines. Prefer `line` plus `side` over legacy diff `position`. A pending review may instead be created without `event` and submitted through `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events`.

Verify through:

```text
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments
```

Verify reviewer, body, state, `commit_id`, timestamp, every inline path and line, and the current `head.sha`.

Official docs: [pull requests](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request), [reviews](https://docs.github.com/en/rest/pulls/reviews), [comments](https://docs.github.com/en/rest/pulls/comments).

## GitLab Merge Requests

Snapshot the merge request and versions. Preserve source-head `sha` and the exact version's `diff_refs`:

- `position[base_sha]` = `base_commit_sha`
- `position[start_sha]` = `start_commit_sha`
- `position[head_sha]` = `head_commit_sha`

Never synthesize these from branch names.

Create pending inline comments through `POST /projects/:id/merge_requests/:merge_request_iid/draft_notes`. A diff position requires the SHA triplet, `position_type: text`, both paths, and `new_line` for a head-side line or `old_line` for a deleted base-side line. Re-read the merge request `sha`, then publish verified drafts together with `POST .../draft_notes/bulk_publish`; use `note` for the summary. Prefer drafts for multi-comment reviews. Immediate comments use `POST .../discussions`.

Where supported, `reviewer_state: requested_changes` or `reviewed` records review state, not formal approval. Formal approval is separate: `POST /projects/:id/merge_requests/:merge_request_iid/approve`. First wait with bounded retries until `detailed_merge_status` is neither `checking` nor `approvals_syncing` and the current version's `patch_id_sha` is non-null; then re-read the SHA and pass the reviewed SHA to approval. A mismatch returns `409 Conflict`.

Verify discussions, exhausted draft notes when used, and approval through:

```text
GET /projects/:id/merge_requests/:merge_request_iid/discussions
GET /projects/:id/merge_requests/:merge_request_iid/approvals
GET /projects/:id/merge_requests/:merge_request_iid/approval_state
```

Verify inline coordinates, authenticated reviewer in `approved_by` when approving, and the current SHA. Tier/version support can make requested-changes readback ambiguous; report that limitation instead of inferring success from the write response.

Official docs: [merge requests](https://docs.gitlab.com/api/merge_requests/), [draft notes](https://docs.gitlab.com/api/draft_notes/), [discussions](https://docs.gitlab.com/api/discussions/), [approvals](https://docs.gitlab.com/api/merge_request_approvals/), [reviews](https://docs.gitlab.com/user/project/merge_requests/reviews/).
