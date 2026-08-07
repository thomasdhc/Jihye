---
name: examen
description: Conduct evidence-based GitHub pull request and GitLab merge request reviews, identify concrete introduced defects, draft concise priority-tagged inline comments, and optionally submit platform-native comments and verdicts after explicit user direction. Use when asked to review, assess, comment on, approve, or request changes on a PR or MR.
---

# Examen

*Examen* is Latin for the needle of a balance and, by extension, weighing or examination. Apply the same idea to proposed code changes: weigh the change against its intent and evidence, then return a proportionate verdict.

Throughout this skill, **review target** means either a GitHub pull request or a GitLab merge request.

## Principles

- Review changed behavior, not merely changed text.
- Trace root cause and execution paths before reporting a defect.
- Report only concrete, actionable problems introduced by the review target.
- Prefer correctness, security, reliability, compatibility, and meaningful performance findings over style preferences.
- Distinguish a regression from a pre-existing defect or an explicitly documented limitation.
- Verify decisive claims directly. Subagents gather and challenge evidence; the calling agent owns every finding and verdict.
- Keep review comments concise enough for the author to act on immediately.
- Use CI/CD evidence privately. Do not repeat check status, pipeline results, or other dashboard-visible CI/CD information in platform review bodies or comments.
- Treat posting comments, approving, and requesting changes as external writes. Do not perform them unless the user explicitly asks.

## Review Workflow

### 1. Establish the review boundary

Accept a pull or merge request URL, or an unambiguous host, project, and number. Detect the hosting platform from the URL or remote; ask when the target or desired action is unclear.

Unless the user already requested submission, conduct a read-only review and return a draft. Do not interpret "review this" as permission to post, approve, or request changes.

For a local checkout:

1. Check its branch and status.
2. Read applicable agent guidance, repository instructions, and the relevant project todo when one exists.
3. Do not check out the review target over a dirty working tree. Prefer host metadata and Git objects for read-only analysis; use an isolated worktree only when execution requires a checked-out source revision or the user requests isolation.

### 2. Snapshot the review target

Record:

- host, project, number or IID, URL, author, state, and draft status
- exact target/base and source/head branch names and commit SHAs
- title, description, linked issues, commits, and changed-file list
- current checks or pipelines, approval state, existing reviews, and discussions

Use the exact source/head SHA throughout the review. Preserve it for submission so comments cannot silently attach to a newer revision.

### 3. Understand intent and changed behavior

1. Read the complete diff.
2. Read the full changed files, not only patch hunks.
3. Inspect relevant callers, tests, configuration, history, and linked issue context.
4. Trace affected execution paths, including realistic input, event, credential, platform, and failure matrices.
5. Compare claimed behavior in the review target's description with actual behavior.
6. Use authoritative external documentation when semantics depend on a platform or dependency.
7. Inspect CI or production evidence when the review target cites specific runs.

Do not expose confidential information or include secrets in commands, logs, searches, comments, or review bodies.

### 4. Validate and delegate proportionately

Run the narrowest relevant checks first. Record exactly what was run and distinguish local validation from existing CI results.

When a review target makes an explicit behavioral claim or applies a repeated or mechanical change, define a finite acceptance invariant before validating it. For that invariant, search only the changed files, their direct runtime dependencies, and any named subsystem explicitly covered by the description; expand further only when evidence from those paths requires it. Classify every residual violation as intentional or actionable before recommending approval. Do not turn this into an unconstrained repository-wide bug search.

Enforce these rules:

- **Deduplicate comments, not obligations.** When multiple manifestations share one root cause, consolidate the feedback while preserving every verified trigger class and affected path necessary for the author to resolve the finding.
- **Re-review against the original invariants.** Carry bounded acceptance checks and unresolved candidates forward, rerun them against the new head, and reconcile every residual before treating the review as clean. Failed checks, unexplained residuals, or conflicting evidence prevent a no-findings conclusion or unconditional approval.

For broad or uncertain reviews, split independent workstreams:

- `scout` — execution paths, callers, history, and repeated patterns
- `researcher` — authoritative external behavior and service documentation
- `reviewer` — challenge consequential or uncertain candidate findings

Parallelize independent work, but directly verify the decisive evidence behind every final finding. When sources conflict, resolve the conflict before commenting.

### 5. Apply the finding gate

A finding must answer all of these:

1. **What changed?** The problem is introduced by this review target, or its description explicitly claims to fix or support the affected path.
2. **How is it triggered?** Give a realistic event, input, configuration, or caller.
3. **What is the impact?** State the concrete failure or risk.
4. **Where is it anchored?** Point to the smallest useful changed-line range.
5. **How can it be resolved?** Give a minimal direction without designing an unrelated refactor.

Do not report:

- speculation without a demonstrable trigger
- defects wholly outside the changed behavior
- style or naming preferences already handled by automated checks
- broad architectural wishes unrelated to the review target
- duplicate symptoms of one root cause
- claims based only on an unverified subagent conclusion

If no issue passes this gate, say that no findings were identified. Do not invent a comment to make the review look substantive.

## Priority

Prefix every inline finding with one priority:

- `[P0]` — catastrophic and broadly blocking; immediate correction required
- `[P1]` — high-impact or common-path defect that should block merge
- `[P2]` — valid defect or broken supported edge case that should be fixed but is normally non-blocking
- `[P3]` — concrete introduced defect with small, localized impact

Choose priority from impact and urgency, not confidence. Omit low-confidence findings rather than lowering their priority.

## Draft Output

Present findings first, ordered by priority. For each finding use this exact structure:

```markdown
### [P2] <short actionable title>
**`path/to/file:line`**

Findings: <one concise sentence describing the trigger and concrete impact> Proposal: <one concise imperative sentence describing the minimal correction>
```

Replace placeholders only. Do not add extra fields, evidence blocks, confidence scores, or prose between findings. Keep `Findings:` and `Proposal:` concise and straight to the point: state only the concrete defect and the minimal actionable correction.

Then include a concise review summary:

- verdict recommendation
- at most three high-signal review notes
- local validation performed
- unresolved evidence limitations
- whether anything was posted to the hosting platform

### Inline comment style

Use this exact single-paragraph template:

```markdown
[P2] Findings: <one concise sentence describing the trigger and concrete impact> Proposal: <one concise imperative sentence describing the minimal correction>
```

Keep the `Findings:` and `Proposal:` labels, their capitalization, their order, and the single-paragraph form. Do not add a title, compliment, review summary, raw log, CI/CD status, or a second finding. Anchor the comment to the changed line that causes the behavior.

## Verdict

Recommend the verdict from the findings:

- Any `[P0]` or `[P1]`: request changes.
- Only `[P2]` or `[P3]`: approval may be appropriate when the findings are non-blocking and the user agrees.
- No findings: approve when the user requests submission.

A green check suite informs the review but does not override a verified defect. Likewise, a non-blocking inline finding can coexist with approval when its priority and the user's direction make that intent clear.

## Strict Submitted Review Template

Use this exact template for every platform review body:

```markdown
<verdict>

### Review notes
- <concise verified behavior note>
- <concise verified behavior note>
```

Replace `<verdict>` with a concise platform-appropriate verdict, such as `LGTM.`, `Review completed.`, or `Changes requested.` Always include exactly two behavior-focused review notes. Do not add author greetings, agent-review announcements, commit SHAs, file counts, validation commands, evidence limitations, CI/CD status, check results, or pipeline summaries.

Do not place findings in the review body; submit each finding inline using the exact `Findings:` / `Proposal:` template.

## Submit Only After Explicit Direction

Before any submission:

1. Re-fetch review-target metadata from its host.
2. Confirm it is still open and reviewable.
3. Confirm the current source/head SHA matches the reviewed SHA. If it changed, inspect the delta and revalidate affected findings first.
4. Confirm inline target lines still exist in the reviewed diff revision.
5. Confirm the authenticated account is allowed to submit the requested verdict and is not approving its own change.
6. Reconcile the requested verdict with the evidence-based recommendation. Ask whenever approval, changes requested, or comment-only submission conflicts with that recommendation.

Use the host's native review model and terminology. Prefer one logical review submission containing the summary, verdict, and inline comments when supported, but do not claim transactional atomicity. Map the recommendation to the closest supported state:

- approve
- request changes or mark the review as blocking
- comment or mark reviewed without approval

Read [references/platforms.md](references/platforms.md) before resolving inline positions or submitting. It records the GitHub and GitLab API differences, revision guards, and verification steps.

When a host requires separate operations, publish the summary and comments before formal approval. Recheck the source/head SHA immediately before every irreversible verdict operation. If a later operation fails, stop, report the partial state precisely, and do not retry blindly.

After submission, verify:

- persisted summary and reviewer identity
- each inline comment's file, line, body, and URL
- submitted revision or diff-version coordinates
- review state, requested-changes state, or formal approval as supported by the host
- current source/head SHA

Return the review-target URL, inline discussion URLs, and final platform-visible verdict. If submission is unavailable, provide the complete draft and state the limitation.
