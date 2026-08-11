# Hosting Platform Reference

Consult this reference only after completing the review, when resolving positions or preparing or performing platform writes. Keep every external write behind the approval gate defined in [`../SKILL.md`](../SKILL.md). Platform APIs and self-managed versions can change; inspect the host's current metadata and authoritative documentation when a capability is uncertain.

Use this reference only for platform-specific coordinates, revision guards, write ordering, and verification behavior. Apply the approval gate and submission invariants from the skill workflow.

## GitHub Pull Requests

### Snapshot

Read the pull request and preserve `head.sha`:

```text
GET /repos/{owner}/{repo}/pulls/{pull_number}
```

Read the full diff, reviews, review comments, checks, and linked issue discussion. Re-read `head.sha` immediately before submission; `commit_id` can attach a review to an older commit and is not a compare-and-swap guard.

### Submit

Create one review containing the summary, inline comments, and verdict:

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Important fields:

- `commit_id` — exact reviewed head SHA
- `body` — overall review summary
- `event` — `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`
- `comments[]` — `path`, `body`, `line`, `side`, and optional multiline coordinates

Use `side: RIGHT` for added or context lines in the head version and `side: LEFT` for deleted base lines. Prefer `line` and `side`; the older diff `position` coordinate is closing down.

To use a pending review, create it without `event`, then submit it through:

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events
```

### Verify

Read back both the review and its comments:

```text
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments
```

Verify reviewer, body, state, `commit_id`, submitted timestamp, and every inline path and line. Then confirm the pull request's current `head.sha` still matches.

Official documentation:

- https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
- https://docs.github.com/en/rest/pulls/reviews
- https://docs.github.com/en/rest/pulls/comments

## GitLab Merge Requests

### Snapshot

Read the merge request and preserve its source-head `sha` and current `diff_refs`:

```text
GET /projects/:id/merge_requests/:merge_request_iid
GET /projects/:id/merge_requests/:merge_request_iid/versions
```

For inline comments, use the current merge request's `diff_refs`, or map the exact diff version fields as follows:

- `position[base_sha]` = `base_commit_sha`
- `position[start_sha]` = `start_commit_sha`
- `position[head_sha]` = `head_commit_sha`

Never synthesize this triplet from local branch names.

### Draft and publish the review

Create pending review comments with:

```text
POST /projects/:id/merge_requests/:merge_request_iid/draft_notes
```

For a diff note, provide `position` with:

- `base_sha`, `start_sha`, and `head_sha`
- `position_type: text`
- both `old_path` and `new_path`
- `new_line` for an added or head-side line, or `old_line` for a deleted base-side line

After all draft notes are ready, re-read the merge request `sha` and require it to equal the reviewed `head_sha` before publishing. On mismatch, do not publish; inspect the delta, revalidate the review, and update or recreate draft positions against the new diff version.

Publish the verified drafts together:

```text
POST /projects/:id/merge_requests/:merge_request_iid/draft_notes/bulk_publish
```

Use `note` for the overall summary. When supported by the GitLab tier and project configuration, use `reviewer_state: requested_changes` for a changes-requested review or `reviewer_state: reviewed` for a non-approval review. This state does not record formal approval.

Create immediate discussions through:

```text
POST /projects/:id/merge_requests/:merge_request_iid/discussions
```

Prefer draft notes when submitting several inline findings so they remain unpublished until the complete review is ready.

### Formal approval

Formal approval is a separate operation:

```text
POST /projects/:id/merge_requests/:merge_request_iid/approve
```

Before approving, wait with a bounded retry until `detailed_merge_status` is neither `checking` nor `approvals_syncing` and the current diff version's `patch_id_sha` is non-null. Re-read the merge request `sha` after this readiness check.

Pass `sha` with the reviewed source-head SHA. GitLab returns `409 Conflict` if it no longer matches, making this a stronger revision guard than GitHub's review `commit_id`.

Because publishing comments and formal approval are separate operations, publish and verify the review first, then approve. If readiness does not converge or approval fails, report that the comments were published but approval was not recorded.

### Verify

Read back the discussions and approval state:

```text
GET /projects/:id/merge_requests/:merge_request_iid/discussions
GET /projects/:id/merge_requests/:merge_request_iid/approvals
GET /projects/:id/merge_requests/:merge_request_iid/approval_state
```

Account for the GitLab tier when using the detailed `approval_state` endpoint. Verify the authenticated reviewer appears in `approved_by` for approval. Also confirm draft notes are exhausted when bulk publication was used and the merge request's current `sha` still matches.

Do not assume every GitLab version or tier exposes a definitive REST readback for every reviewer-state variant. When requested-changes verification is ambiguous, report that limitation rather than inferring success from the write response alone.

Official documentation:

- https://docs.gitlab.com/api/merge_requests/
- https://docs.gitlab.com/api/draft_notes/
- https://docs.gitlab.com/api/discussions/
- https://docs.gitlab.com/api/merge_request_approvals/
- https://docs.gitlab.com/user/project/merge_requests/reviews/
