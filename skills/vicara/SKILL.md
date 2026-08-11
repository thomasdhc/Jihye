---
name: vicara
description: Investigate one existing repository, orchestrate evidence-gathering subagents, rank verified opportunities, and write a resumable Markdown report. Use when asked to identify high-impact repository work grounded in repository evidence.
disable-model-invocation: true
---

# Vicara

Investigate one existing repository and write a persistent report of atomic, evidence-backed opportunities. Keep implementation outside this workflow unless the user separately requests a selected opportunity.

## Set the Prompt Boundary and Report

Define the **Destination** as what this investigation pass must make possible. Define the **Frontier** as the open investigation streams and candidate opportunities worth continuing.

Use a user-provided report path. Otherwise, use `OPPORTUNITIES.md` at the repository root. Pass every applicable approval gate before creating or updating the report.

When the report exists:

- read it first
- resume from `Frontier` and `Needs More Investigation`
- preserve useful prior findings
- mark stale, superseded, or resolved items instead of silently deleting them
- add a session note

Use this report structure:

```markdown
# Repo Opportunity Report

## Destination

<what this pass is trying to make possible>

## Repo Snapshot

- Purpose:
- Primary languages/formats:
- Important commands:
- Major areas:
- Guidance read:
- Areas ignored or sampled lightly:

## Frontier

- [ ] <area/question> — <why it matters; next check>

## Opportunities

### 1. <title>

- Category:
- Impact: <low | medium | high> — <why>
- Effort: <small | medium | large> — <why>
- Risk: <low | medium | high> — <why>
- Confidence: <low | medium | high> — <why>
- Agent suitability: <good | mixed | poor> — <why>
- Evidence:
  - `<path>` — <observed fact and verification>
- Suggested first step:
- Validation:

## Needs More Investigation

- <question/area> — <what is known; what remains>

## Out of Scope

- <area> — <why>

## Session Notes

### <date/session>

- Explored:
- Subagents used:
- Key findings:
- Next recommended action:
```

## Map Before Delegating

1. Read the existing report, repository guidance, metadata, and relevant project todo when one exists.
2. Set the Destination and prompt boundary for this pass.
3. Build a low-resolution map of the repository's purpose, major areas, important commands, validation artifacts, conventions, and low-signal areas.
4. Update `Repo Snapshot` and identify the Frontier.
5. Exclude generated, vendored, irrelevant, or explicitly out-of-scope areas.

Do not begin with an unbounded repository-wide bug search. Let the Destination and repository evidence control expansion.

## Keep Ownership and Delegate Bounded Work

Keep ownership of source-of-truth context, conflict resolution, validation, every finding and verdict, ranking, report updates, and final synthesis in the calling agent. Treat subagent output as evidence to verify, never as authority.

Use these specialist roles:

- `scout` — inspect one repository-local area, execution path, repeated pattern, validation surface, or documentation/code consistency question
- `researcher` — resolve one external API, dependency, framework, service, CI, or lifecycle question raised by repository evidence
- `reviewer` — challenge one falsifiable opportunity claim or the draft ranking
- `engineer` — implement only after the user separately requests a selected opportunity

When the Frontier has multiple streams, dependencies, shared resources, isolation needs, or non-trivial integration, load and follow the `coordinate` skill before the first subagent call; build the execution skeleton in the calling agent's context, then immediately launch its first actionable group. For one bounded stream or an obvious direct fan-out, launch bounded independent calls directly and parallelize only safe work.

Give each subagent the Destination, bounded question, relevant repository context, reason the stream matters, areas to ignore, and required output. Request:

1. conclusion
2. decisive evidence with paths, line numbers, symbols, or commands
3. candidate opportunities
4. confidence and uncertainty
5. next verification or report update

Prefer several small independent tasks over one broad task. Stop delegating when the calling agent can finish the remaining bounded work more directly.

## Reconcile Candidates

For every candidate:

- separate observed facts from proposed work
- deduplicate shared root causes without dropping distinct trigger classes
- resolve conflicting evidence through direct inspection or a focused reviewer challenge
- move weak or unfinished candidates to `Frontier` or `Needs More Investigation`
- preserve the prompt boundary and record excluded areas under `Out of Scope`

Use a focused reviewer challenge when a candidate is high-impact, surprising, risky, or evidence-sensitive. Give the reviewer the exact claim, decisive evidence, affected files, risk questions, and evidence that would change the verdict. Reconcile the reviewer verdict directly; do not adopt it without verification.

## Apply the Finding Gates

Treat a candidate opportunity as a finding only after it passes this finding gate:

1. Verify the underlying repository fact directly or with focused local validation.
2. Identify one independently implementable and independently validatable change.
3. State concrete repository impact, bounded scope, a safe first step, and a credible validation path.
4. Separate unresolved assumptions into `Needs More Investigation`.

Pass top findings through this additional finding gate before ranking:

- Give each of the top three findings, or every finding when fewer than three exist, decisive support from direct calling-agent verification, a local reproduction or focused validation command, or a focused reviewer verdict.
- Record the verification method and result in `Evidence` or `Validation`.
- Do not let an unverified scout conclusion pass the finding gate.

After drafting the ranking, give a reviewer the proposed top findings and decisive evidence. Require the reviewer to challenge ordering, impact, overlap, bundled scope, existing mitigations, implementation clarity, validation clarity, and credible higher-value alternatives. Reconcile that verdict by splitting, merging, reordering, downgrading, or returning candidates to `Needs More Investigation`.

## Rank and Update

Make each opportunity atomic. Split work that shares a subsystem or motivation when its prerequisites, risks, implementation, or validation differ.

Rank findings by:

1. likely repository value
2. evidence strength
3. scope clarity
4. implementation safety
5. validation ease
6. agent suitability

Use repository-relevant categories such as bug fix, refactor, validation/testing, documentation, workflow/automation, feature, or cleanup. Do not force every category into the report.

Update the Destination, Repo Snapshot, Frontier, Opportunities, Needs More Investigation, Out of Scope, and Session Notes so another session can resume without reconstructing the investigation.

## Final Response

After updating the report, return only:

- report path
- top three opportunities
- safest first task
- highest-impact task
- next investigation target
