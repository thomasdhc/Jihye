---
name: examen
description: Review a GitHub pull request or GitLab merge request for concrete introduced defects, draft priority-tagged inline findings, and optionally submit a platform-native verdict. Use when asked to review, assess, comment on, approve, or request changes on a PR or MR.
---

# Examen

Review changed behavior against intent and verified evidence. Treat a GitHub pull request or GitLab merge request as the **review target**.

## Review the Target

1. Resolve an unambiguous target and whether the user wants a draft or a platform submission. A request to review is read-only; only explicit direction to post, approve, request changes, or submit a comment authorizes that specific external write.
2. Snapshot the host, project, number, URL, state, exact base and head branches and SHAs, description, linked issues, commits, changed files, checks, reviews, and discussions. Preserve the reviewed head SHA.
3. Read the complete diff and changed files. Inspect relevant callers, tests, configuration, history, issue context, and authoritative dependency or platform documentation. Trace realistic input, event, configuration, credential, platform, and failure paths.
4. Compare claimed and actual behavior. Distinguish an introduced regression from a pre-existing defect or documented limitation. Use CI evidence for validation, but omit dashboard-visible CI status from submitted comments and review bodies.
5. Run focused checks. For explicit behavioral claims and repeated changes, define finite acceptance invariants over changed files, direct runtime dependencies, and any named subsystem. Classify every residual as intentional or actionable.
6. Consolidate manifestations with one root cause while retaining every verified trigger class and affected path needed for a fix. On a new head, rerun the original invariants and reconcile unresolved candidates before concluding the review is clean.
7. Apply the loaded coordination guidance when delegation is warranted. Directly verify decisive evidence and use a reviewer challenge for consequential or uncertain candidates.

## Apply the Finding Gate

Report a candidate only when all are true:

1. The review target introduced it, or explicitly claims to fix or support the affected path.
2. A realistic event, input, configuration, or caller triggers it.
3. The concrete failure or risk is established.
4. The smallest useful changed-line range anchors it.
5. A minimal, scope-preserving correction is available.

Exclude speculation, wholly pre-existing defects, automated style concerns, unrelated architectural wishes, duplicate symptoms, and unverified delegated claims. If nothing passes, report no findings.

## Assign Priority and Verdict

Prefix every finding by impact and urgency, never confidence:

- `[P0]` — catastrophic and broadly blocking; immediate correction required
- `[P1]` — high-impact or common-path defect; block merge
- `[P2]` — valid defect or broken supported edge case; require a fix but normally do not block merge
- `[P3]` — concrete introduced defect with small, localized impact

Omit low-confidence candidates rather than lowering priority. Map findings to the verdict:

- Any `[P0]` or `[P1]`: request changes.
- Only `[P2]` or `[P3]`: approval may be appropriate when non-blocking and the user agrees.
- No findings: approve when the user requests submission.

Checks inform but do not override a verified defect. A non-blocking inline finding may coexist with approval.

## Return the Draft

Present findings first by priority using exactly:

```markdown
### [P2] <short actionable title>
**`path/to/file:line`**

Findings: <one concise sentence describing the trigger and concrete impact> Proposal: <one concise imperative sentence describing the minimal correction>
```

Then give the verdict recommendation, at most three high-signal notes, local validation, unresolved evidence limits, and whether anything was posted.

For each platform inline comment, use this exact single paragraph and anchor it to the changed line causing the behavior:

```markdown
[P2] Findings: <one concise sentence describing the trigger and concrete impact> Proposal: <one concise imperative sentence describing the minimal correction>
```

Do not add a title, compliment, summary, raw log, CI status, or second finding to an inline comment.

## Submit and Verify

Before an authorized submission:

1. Re-fetch metadata; require an open, reviewable target whose current head SHA equals the reviewed SHA.
2. Revalidate affected findings after any head change and confirm every inline line still exists in that diff revision.
3. Confirm the authenticated account can perform the requested action and is not approving its own change.
4. Reconcile the requested platform state with the evidence-based verdict; ask if they conflict.
5. Read [references/platforms.md](references/platforms.md), resolve revision-specific positions, and use the host's native review model.

Prefer one logical review submission when supported; never claim transactional atomicity. When operations are separate, publish and verify comments before formal approval, rechecking the head SHA immediately before the irreversible verdict. On partial failure, stop and report the persisted state rather than retrying blindly.

Read back and verify the summary, reviewer, every inline body/path/line/URL, submitted revision coordinates, platform-visible review or approval state, and current head SHA. Return the target URL, discussion URLs, and final visible verdict; if submission is unavailable, return the complete draft and limitation.
