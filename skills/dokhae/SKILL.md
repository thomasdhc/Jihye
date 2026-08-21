---
name: dokhae
description: Read a primary source closely and critically, audit what it cites, and build a durable track of numbered through-lines, cited resources, and follow-up threads. Use when asked to read, review, or critique an essay or paper, to build or resume a reading track, or to work a reading follow-up queue.
disable-model-invocation: true
---

# Dokhae

## Preserve the Reading Invariants

- Read the primary source directly and in full before writing any judgment of it. Never review a source from a summary, an abstract, a citation, or recall.
- Restate the source's own case in the source's own terms before objecting to it, and state its strongest form rather than its most attackable one.
- Keep what the source claims separate from what the reading concludes. A brief reports; a through-line argues.
- Apply the finding gate to every objection: name the passage, measurement, table, or specific omission it contradicts. An objection that names nothing is a reaction, not a finding.
- Quote the source's own words wherever the wording is load-bearing. Preserve the quotation and its location alongside the claim it supports; a claim without its evidence decays into an assertion the reader cannot re-verify.
- Audit a cited source as its own primary source whenever a load-bearing claim rests on it. Never inherit a citation's characterization of what it cites.
- Score a prediction against the observed outcome only with hindsight, and name the date the score is taken. A scorecard without its date cannot be re-checked later.
- Record what would falsify a through-line when a falsifier exists.
- Treat the reader's questions and detours as the track, not an interruption.
- Never resolve a queue item from recall. Re-read the source that raised it.
- Advance only on the reader's explicit signal.
- Treat the conversation as transient. Capture notes before advancing.
- Preserve the agreed subject, outcome, and reading arc as the track's prompt boundary. Revise them with the reader, never unilaterally.

## Locate the Track

Resolve the reading home rather than assuming one. Follow an explicit target, then the first applicable:

1. Follow explicit user or project instructions.
2. Use the reading home named by workspace-owned configuration, such as a workspace `REPO.md` that designates a repository or directory for reading tracks.
3. Under a workspace whose guidance claims a directory for reusable learning artifacts, use that directory.
4. Propose a location and confirm it before creating one.

Place the track at `<reading home>/<track-slug>/`. Derive the slug from the track subject in lowercase kebab-case; ask when ambiguous. Never hardcode a reading home into this workflow; a resolved home is configuration, and configuration changes without changing the workflow.

Read `references/track.md` for the file layout and templates, and follow the reading home's own guidance when it adds constraints.

Pass this read gate: read `TRACK.md` and `queue.md` before selecting a source, opening a reading, or resolving a follow-up.

## Scope the Track

Run this once per track, before reading any source into it. Establish through dialogue:

- the understanding the reader wants and what it is for,
- the primary source that opens the track,
- what makes a further source belong to this track rather than a new one,
- the depth of audit each source warrants, from a brief to a full methodology audit,
- the observable condition that ends the track, or that the track is standing and has none.

Confirm the scope with the reader, then write `TRACK.md` once.

Admit a source to the track by its relationship to a source already in it — cited by, citing, responding to, superseding, or sharing the claim under test. Record that relationship in the `TRACK.md` lineage table when the source is admitted, not after it is read. A source with no recorded relationship belongs to a different track.

## Run the Reading Loop

Repeat for each reading:

1. **Select** the next source from `queue.md` or from the reader, and record it in the lineage table with its relationship to the track.
2. **Read** it directly and in full. Do not write a judgment during this step.
3. **Brief** the source's own case in its own terms, and confirm with the reader that the brief is fair before proceeding.
4. **Detour** into each cited source carrying a load-bearing claim, and audit it under these same invariants. Record each detour inside the reading that raised it.
5. **Object** where the finding gate is passed, naming the passage or measurement each objection contradicts.
6. **Score** the source's own predictions, promises, and named falsifiers against observed outcomes, and name the date.
7. **Distill** the conclusions that outlive this source into numbered through-lines in `notes.md`.
8. **Queue** every unresolved thread in `queue.md` with the reading that raised it, before closing the reading.

Keep the depth agreed in scoping. Escalate a brief into a full audit only with the reader, and record the escalation as a scope revision.

## Maintain the Queue

`queue.md` is the track's live state and the entry point of every sitting. Keep three kinds of item separate:

- **Follow-ups** — a specific unresolved thread, each naming the reading that raised it and the check that would close it.
- **Candidate readings** — a source named but not yet read, each with the relationship that admits it to the track.
- **Open questions** — a question the track has not yet found a source for.

Close a follow-up by recording its result where the result belongs — a through-line in `notes.md`, a correction inside the reading, or a new source in the lineage — then mark it closed with a pointer to that destination. Never delete a closed item; a closed item is the record that the check was run.

Promote a candidate reading into the lineage table when it is selected, and mark an item abandoned with its reason rather than removing it.

## Capture Notes and Lineage

Keep two records with separate purposes:

- `notes.md` holds the durable, cross-cutting through-lines the reader re-reads. Number its sections globally across the whole track and continue that numbering into every later reading, so a cross-reference survives.
- `TRACK.md` holds the scope, the lineage table, status, and the resume pointer. It is the map of the track, not reading material.

Write `notes.md` claim-first: a bold one-line claim, its decisive evidence, then at most one line of consequence. Cite the reading and the passage behind each claim. A through-line that only one source supports is a reading conclusion; say so rather than generalizing it.

Keep the per-reading critical read in its own reading file and out of `notes.md`.

## Deliver the Track Record

Commit the track record and open a pull request at each checkpoint:

- the track is scoped and `TRACK.md` is written,
- a reading is opened and its source is admitted to the lineage,
- a reading completes and its through-lines and queue items exist,
- the reader pauses, ends a sitting, or asks to stop.

Carry every checkpoint through to the pull request. A commit alone does not satisfy one, and no checkpoint waits for a later checkpoint to deliver it.

Treat each checkpoint as a delivery boundary in the reading home's repository. Pass the read gate for Git guidance, then apply the workspace Git workflow for branching, staging, the agent commit command, the push handoff, and the pull request.

Report the checkpoint reached and what was committed, then resume the loop where the reader left it.
