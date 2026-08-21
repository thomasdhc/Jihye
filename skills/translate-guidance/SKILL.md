---
name: translate-guidance
description: Initialize, check, refresh, enrich, or compact ignored AGENTS.override.md guidance deltas for external Git repositories without changing or restating owner guidance. Use when reconciling Jihye with repository instructions that Jihye does not own.
compatibility: Pi 0.84.0 or newer and Git are required to activate projections.
---

# Translate Guidance

Maintain each local `AGENTS.override.md` as an ignored **projection**: a pointer to the owner guidance that override displaces, followed by Jihye's local delta. Owner guidance stays authoritative and is never copied into the projection, so a projection adds context instead of replacing it. Ignored companion metadata records what the delta was built against.

## Establish the Target and Operation

Require one Git repository and one operation: **initialize**, **check**, **refresh**, **enrich**, **compact**, or **propose upstream**. Infer initialize when no projection exists and check when one does; ask when any other operation is ambiguous.

1. Resolve the target with `git rev-parse --show-toplevel`. Treat a submodule as a separate repository and translation boundary; do not traverse into nested repositories.
2. Treat each linked worktree as a separate projection target. Git shares `info/exclude` through the common directory, but an untracked projection never propagates, so a projection created elsewhere does not govern the current worktree.
3. Apply the governing read gates before touching the target. Inspect branch, worktree, and status without moving, staging, or discarding pre-existing changes.
4. Run `pi --version` and require Pi 0.84.0 or later. On an older version, create or activate nothing. Report any existing projection as unsupported and do not rely on it.
5. Establish the instruction boundary. Owner-authored guidance controls owner intent and conventions; implementation, configuration, tests, CI, and documentation control repository facts; Jihye controls its operating method; verified local discoveries and explicit user decisions control only the local delta.
6. Apply Fidelity to every owner requirement, boundary, command, and invariant. Owner guidance is the fidelity floor, not a ceiling on useful evidence-backed context.

Never modify owner-authored guidance during this workflow. Never copy an owner requirement into a projection; point at it instead. Never make a projection or its metadata tracked, staged, or publishable.

## Resolve the Guidance Topology

Discover the complete repository guidance topology before trusting an existing projection or drafting a new one.

- Find `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, and `CLAUDE.MD` from the repository root through relevant scopes. Exclude `.git`, generated or vendored trees, and nested Git repositories.
- Apply Pi's same-directory precedence, which prefers `AGENTS.override.md` over every other context file in that directory. An override replaces guidance only in its own directory; guidance from other directories continues to layer.
- Record the exact owner file each projection displaces in its own directory. That file is the projection's pointer target.
- Classify every override as tracked owner guidance, an untracked Jihye-managed projection with valid companion metadata, or a local file without valid Jihye ownership data. Refuse to overwrite tracked or ambiguously owned files.
- Read every applicable owner source completely before drafting a delta. Preserve symlink identity and inspect its canonical target when maintained elsewhere.
- Resolve the local exclude file with `git rev-parse --git-path info/exclude`; never assume `.git` is a directory. Record the exact root-relative projection and metadata paths as anchored exclude entries and verify each with `git check-ignore -v`.
- Select only canonical evidence needed to verify the blueprint, paths, commands, validation, generated-file boundaries, and architectural claims. Record its paths and content SHA-256.

If the session working directory is above the repository root, Pi will not discover repository context automatically. Resolve and check the projection manually before the displaced owner file, and require a session inside the repository before claiming automatic activation.

## Use the Managed Format

Store companion metadata under a repository-root `.jihye/` directory. Mirror the projection's repository-relative path beneath it and append `.json`, so root and scoped projections remain distinct:

```text
AGENTS.override.md         → .jihye/AGENTS.override.md.json
client/AGENTS.override.md  → .jihye/client/AGENTS.override.md.json
```

Exclude each exact metadata file, not the whole `.jihye/` directory, and do not disturb unrelated contents there. The companion contains one machine-readable JSON object:

```json
{"format":1,"contract":"translate-guidance/v1","state":"current","projection":"AGENTS.override.md","projectionSha256":"<sha256>","scope":".","piMin":"0.84.0","pointer":"AGENTS.md","ownerSources":[{"path":"AGENTS.md","sha256":"<sha256>"}],"evidence":[{"path":"package.json","sha256":"<sha256>"}]}
```

Keep provenance out of the projection itself. Pi loads the `AGENTS.override.md` guidance body but not the companion, and only lifecycle operations parse metadata. Treat the projection and companion as one ownership unit. Use repository-root-relative POSIX paths throughout and write deterministic valid JSON. Set `projectionSha256` to the SHA-256 of the exact guidance-file bytes so a stale companion cannot claim a replaced or manually altered override. Record `ownerSources` as the files whose content the delta was written against, so an added, moved, deleted, or edited source is detectable without storing owner text. Set `state` to `current` only after approval, writing, and verification all succeed. A missing, invalid, mismatched, tracked, staged, or unexcluded companion makes the projection unsafe. Change the format or contract identifier only when the metadata or lifecycle semantics change.

Organize the projection body as a pointer followed by the delta, omitting an empty section:

```markdown
# Local Guidance Projection

## Owner Guidance
Read `AGENTS.md` in this directory first and follow it in full. It is authoritative, and nothing below weakens it.

## Blueprint Brief
## Local Adaptations
```

Name the exact displaced owner file in the pointer, and omit the pointer only when the projection's directory displaces no owner guidance. Put repository facts only in the evidence-backed blueprint brief. Put Jihye-specific reconciliation, explicit user decisions, and durable discoveries only in local adaptations. Quote an owner requirement only where a local adaptation is unreadable without it, and cite its owner file. Never write a projection while a substantive conflict remains unresolved.

## Initialize the Projection

1. Verify that no projection or metadata target is tracked, staged, or occupied by a file without valid Jihye ownership data.
2. Derive only the evidence-backed blueprint needed for future work. Admit each enrichment only when it is durable, evidence-backed, correctly scoped, absent from governing guidance, useful to future work, and worth its runtime context cost.
3. Create a projection only where its directory displaces owner guidance or a verified local scope needs a distinct delta. Check the complete ancestor chain and explicit owner-defined precedence; no delta may weaken an applicable requirement from another scope.
4. Draft the proposed delta and label every entry with the evidence supporting it. Maintain a conflict register outside the proposed projection.
5. Surface each substantive conflict between owner authority and Jihye's operating method with its authorities, practical consequence, and viable resolutions. Obtain an explicit decision, fold it into local adaptations, and redraft. Repeat until no substantive conflict remains; if the user defers one, stop without writing.
6. Show the complete proposed projection for manual verification, then pass an explicit approval gate before writing projections, metadata, or exclude entries.
7. Add only the exact projection and metadata paths to the Git-resolved `info/exclude`, create only the required `.jihye/` parent directories, write companion metadata with state `review-required`, then write the approved guidance body.
8. Verify owner sources are unchanged; projections and metadata are untracked and unstaged; `git check-ignore -v` resolves each to `info/exclude`; normal `git status` omits them; and `git status --ignored` reveals them at the expected paths. Set metadata state to `current` only after these checks pass, then revalidate the companion.
9. Ask the user to run `/reload` from a session inside the repository. Do not claim the projection governs until reload and loaded-context verification succeed.

## Check Freshness

Keep check deterministic and cheap; do not redraft the delta.

1. Re-run the version, ownership, topology, exclusion, and Git-state checks.
2. Parse every managed companion and recompute the projection fingerprint, owner-source fingerprints, and selected evidence fingerprints.
3. Return one state per projection:
   - **current** — metadata state is `current`, ownership and exclusion are safe, the pointer names an existing owner file, and all fingerprints match.
   - **reconciliation required** — metadata state is `review-required`, so a mutating operation wrote but never completed verification.
   - **refresh required** — owner guidance, its topology, or selected evidence changed, including an added, moved, or deleted source.
   - **unsafe** — companion metadata is invalid or mismatched, either managed file became tracked or staged, exclusion is missing, or ownership is ambiguous.
   - **unsupported** — active Pi is older than 0.84.0.
4. Report the exact mismatches whenever a state is not current. A stale delta never hides an owner requirement, because the pointer keeps owner guidance in force. Continue repository work under owner guidance and treat only the local adaptations as unverified. Stop and repair before relying on the projection when the state is unsafe or the pointer target is missing.

## Refresh the Delta

1. Identify which recorded owner sources changed, moved, or disappeared, then read the current guidance topology completely. The companion stores fingerprints rather than owner text, so re-read the owner rather than reconstructing a prior revision.
2. Replay the blueprint brief and local adaptations onto the current owner guidance. Remove local duplication when owners now express it canonically; never remove evidence-backed local value merely because upstream changed nearby text.
3. Update the pointer when the displaced owner file changed name, location, or precedence.
4. Detect altered precedence and cross-scope conflict. Resolve only from authority or canonical evidence. Surface every remaining substantive conflict, obtain a decision, and fold the reconciliation into the proposal; stop without writing if any conflict is deferred.
5. Show the old-delta and new-delta comparison alongside the owner sources that motivated it, then pass the approval gate.
6. Set companion state to `review-required`, replace only Jihye-managed projection-and-companion pairs, repeat initialization verification, set state to `current`, and require `/reload` plus loaded-context verification.

Change companion state only as part of a write. An operation that ends without writing leaves the existing projection and its metadata untouched.

## Enrich or Compact

For **enrich**, accept a discovery only when it is durable, evidence-backed, correctly scoped, absent from governing guidance, useful to future work, and worth its runtime context cost.

For **compact**, remove stale facts, owner duplication, superseded adaptations, and low-value context. Preserve every still-operative conflict reconciliation. Prefer higher information density over shorter text alone.

Both operations change only the local delta and never the pointer. Surface and reconcile substantive conflicts, show the semantic delta, and pass the approval gate. Then write under the same state rule as refresh, repeat the safety and freshness checks, restore state to `current`, and require reload verification.

## Propose Upstream

Prepare a narrowly scoped owner-facing proposal only for a local adaptation that is generally useful without Jihye-specific context. Identify the owner source, rationale, and exact proposed change. Do not alter owner guidance automatically; leave any upstream edit to a separately authorized delivery boundary. Keep the local delta until the owner change lands and a refresh removes the duplication.

## Return the Result

Report the repository and worktree, operation, Pi compatibility, discovered topology, pointer target, projection and metadata state and paths, delta changes or mismatch details, reconciled decisions or conflicts still blocking a write, exact exclude file, safety verification, and reload status. Distinguish completed activation from files that are merely drafted or written.
