# Hosting Platform Submission Reference

Read this only when preparing or performing an authorized submission. Platform APIs and self-managed versions vary; inspect current metadata and authoritative documentation when capability is uncertain.

## Submitted Review Body

When the authorized action includes a review body, use exactly:

```markdown
<verdict>

### Review notes
- <concise verified behavior note>
- <concise verified behavior note>
```

Replace `<verdict>` with `LGTM.`, `Review completed.`, `Changes requested.`, or an equivalent concise verdict. Include exactly two behavior-focused notes. Exclude findings, greetings, agent announcements, SHAs, file counts, commands, evidence limitations, and CI status. Never place a finding in the review body; submit each finding inline using the exact `Findings:` / `Proposal:` paragraph the skill defines.

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

Verify the reviewing account, body, state, `commit_id`, timestamp, every inline path and line, and the current `head.sha`.

Official docs: [pull requests](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request), [reviews](https://docs.github.com/en/rest/pulls/reviews), [comments](https://docs.github.com/en/rest/pulls/comments).

## GitLab Merge Requests

Use the Draft Notes API for a multi-comment review; it stages private comments and publishes them together, unlike immediate discussions or GraphQL diff notes. Snapshot the merge request and versions. Preserve source-head `sha` and the exact version's `diff_refs`:

- `position[base_sha]` = `base_commit_sha`
- `position[start_sha]` = `start_commit_sha`
- `position[head_sha]` = `head_commit_sha`

Never synthesize these from branch names. Verify each path and line against that version's diff. Use `new_line` for a head-side line, `old_line` for a deleted base-side line, and both for an unchanged context line.

Before staging, list `GET /projects/:id/merge_requests/:merge_request_iid/draft_notes` and require that bulk publication would include only drafts intended for this review; `bulk_publish` publishes every pending draft that the authenticated user owns on the merge request.

Create each draft through `POST .../draft_notes`. The content field is `note`, not `body`. With `glab api`, send the position as literal nested JSON; do not use bracketed `-f 'position[...]'` fields, which are serialized as flat JSON keys, or multipart `--form`. Include the JSON content type explicitly because `--input` does not set one:

```bash
set -euo pipefail
mr="projects/$PROJECT_ID/merge_requests/$MR_IID"
drafts="$mr/draft_notes"

response="$(
  jq -n \
    --arg note "$COMMENT" \
    --arg base "$BASE_SHA" \
    --arg start "$START_SHA" \
    --arg head "$HEAD_SHA" \
    --arg old_path "$OLD_PATH" \
    --arg new_path "$NEW_PATH" \
    --argjson line "$NEW_LINE" \
    '{note:$note, position:{
      position_type:"text",
      base_sha:$base, start_sha:$start, head_sha:$head,
      old_path:$old_path, new_path:$new_path, new_line:$line
    }}' |
  glab api --method POST "$drafts" \
    --header 'Content-Type: application/json' --input -
)"
```

For a deleted line, replace `new_line` with `old_line`. After each successful creation, record the returned draft ID and require the returned `note`, SHA triplet, paths, and line coordinates to match the request; never publish a draft whose `position` is null. Update or delete a malformed unpublished draft before continuing.

Re-list all drafts and re-read the merge request `sha` immediately before publication. For a comments-only submission, publish with no summary or state payload:

```bash
glab api --method POST "$drafts/bulk_publish"
```

When explicitly authorized, send the submitted review body as `note` or set `reviewer_state` to `requested_changes` or `reviewed` in a nested JSON payload using the same `--input -` and content-type form; include only the authorized fields. Reviewer state is not formal approval. Formal approval is separate: `POST .../approve` or `glab mr approve`. First wait with bounded retries until `detailed_merge_status` is neither `checking` nor `approvals_syncing` and the current version's `patch_id_sha` is non-null; then re-read the SHA and pass the reviewed SHA to approval. A mismatch returns `409 Conflict`.

Draft creation returns a JSON draft; successful single or bulk publication can return `204 No Content`. Treat an empty bulk response as provisional success. Verify exhausted drafts, discussions, any summary note, and approval through:

```text
GET /projects/:id/merge_requests/:merge_request_iid/draft_notes
GET /projects/:id/merge_requests/:merge_request_iid/discussions
GET /projects/:id/merge_requests/:merge_request_iid/notes
GET /projects/:id/merge_requests/:merge_request_iid/approvals
GET /projects/:id/merge_requests/:merge_request_iid/approval_state
```

Verify every inline body and coordinate, the authenticated reviewing account, the requested platform state, and the current SHA. After any publication timeout or error, reconcile drafts, discussions, notes, and review state before retrying because bulk publication is not transactional. Tier/version support can make requested-changes readback ambiguous; report that limitation instead of inferring success from the write response.

Official docs: [merge requests](https://docs.gitlab.com/api/merge_requests/), [draft notes](https://docs.gitlab.com/api/draft_notes/), [discussions](https://docs.gitlab.com/api/discussions/), [approvals](https://docs.gitlab.com/api/merge_request_approvals/), [reviews](https://docs.gitlab.com/user/project/merge_requests/reviews/), [`glab api`](https://docs.gitlab.com/cli/api/).
