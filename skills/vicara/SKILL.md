---
name: vicara
description: Investigate one existing repository, rank verified improvement opportunities, and maintain a resumable Markdown report. Use when asked to identify high-impact repository work grounded in repository evidence.
disable-model-invocation: true
---

# Vicara

Investigate one repository and report atomic, evidence-backed opportunities. Do not implement an opportunity unless the user separately requests it.

## Resume the Investigation

Define **Destination** as what this pass must make possible and **Frontier** as the open streams and candidates worth continuing.

Use the user's report path or default to `OPPORTUNITIES.md` at the repository root. Before creating or updating it, read [references/report.md](references/report.md). When it exists:

- read it first
- resume from `Frontier` and `Needs More Investigation`
- preserve useful findings
- mark stale, superseded, or resolved items instead of silently deleting them
- add a session note

## Map and Investigate

1. Read the report, repository metadata, and applicable project context.
2. Set the Destination for this pass.
3. Map the repository's purpose, major areas, commands, validation surfaces, conventions, and low-signal areas.
4. Update the snapshot and Frontier; exclude generated, vendored, irrelevant, and explicitly excluded areas.
5. Investigate bounded Frontier streams. Use scoped scout or researcher work where useful, and load and follow the `coordinate` skill for non-trivial multi-stream delegation.
6. Separate observed facts from proposed work. Deduplicate shared root causes without losing distinct trigger classes. Move weak or unfinished candidates to `Frontier` or `Needs More Investigation`.

Let the Destination and repository evidence control expansion; do not start an unbounded repository-wide bug search.

## Apply the Finding Gate

An opportunity passes the finding gate only when:

1. Focused inspection or local validation verifies the underlying repository fact.
2. It is one independently implementable and independently validatable change.
3. Its repository impact, bounded scope, safe first step, and credible validation path are stated.
4. Unresolved assumptions are separated into `Needs More Investigation`.

For each proposed top-three finding, or every finding when fewer exist, record decisive support from direct verification, a local reproduction or focused validation command, or a focused reviewer verdict. Never promote an unverified delegated conclusion.

Use a focused reviewer challenge for any high-impact, surprising, risky, or evidence-sensitive candidate. Give the reviewer the exact claim, decisive evidence, affected files, risk questions, and evidence that would change the verdict; verify and reconcile the response.

After drafting the ranking, require a reviewer to challenge ordering, impact, overlap, bundled scope, existing mitigations, implementation and validation clarity, and credible higher-value alternatives. Reconcile by splitting, merging, reordering, downgrading, or returning candidates to investigation.

## Rank and Update the Report

Apply Solution Architecture when assessing scope clarity, implementation safety, and validation. Keep each opportunity atomic; split work when prerequisites, risks, implementation, or validation differ. Rank by:

1. likely repository value
2. evidence strength
3. scope clarity
4. implementation safety
5. validation ease
6. agent suitability

Use only categories relevant to the repository. Update every report section needed for another session to continue without reconstructing the investigation.

## Return

After updating the report, return only:

- report path
- top three opportunities
- safest first task
- highest-impact task
- next investigation target
