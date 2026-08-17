---
name: translate-guidance
description: Initialize, check, refresh, enrich, or compact ignored AGENTS.override.md projections for external Git repositories without changing owner guidance. Use when reconciling Jihye with repository instructions that Jihye does not own.
compatibility: Pi 0.84.0 or newer and Git are required to activate projections.
---

# Translate Guidance

Maintain each local `AGENTS.override.md` as an ignored guidance projection with separate ignored Jihye metadata: owner guidance is upstream, its first translation is the synchronized base, evidence-backed local guidance is the delta, and refresh semantically rebases that delta.

## Establish the Target and Operation

Require one Git repository and one operation: **initialize**, **check**, **refresh**, **enrich**, **compact**, or **propose upstream**. Infer initialize when no projection exists and check when one does; ask when any other operation is ambiguous.

1. Resolve the target with `git rev-parse --show-toplevel`. Treat a submodule as a separate repository and translation boundary; do not traverse into nested repositories.
2. Apply the governing read gates before touching the target. Inspect branch, worktree, and status without moving, staging, or discarding pre-existing changes.
3. Run `pi --version` and require Pi 0.84.0 or later. On an older version, create or activate nothing. Report any existing projection as unsupported and do not rely on it.
4. Establish the instruction boundary. Owner-authored guidance controls owner intent and conventions; implementation, configuration, tests, CI, and documentation control repository facts; Jihye controls its operating method; verified local discoveries and explicit user decisions control only the local delta.
5. Apply Fidelity to every owner requirement, boundary, command, and invariant. Owner guidance is the fidelity floor, not a ceiling on useful evidence-backed context.

Never modify owner-authored guidance during this workflow. Never make a generated projection or its metadata tracked, staged, or publishable.

## Resolve the Guidance Topology

Discover the complete repository guidance topology before trusting an existing projection or drafting a new one.

- Find `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, and `CLAUDE.MD` from the repository root through relevant scopes. Exclude `.git`, generated or vendored trees, and nested Git repositories.
- Apply Pi's same-directory precedence: `AGENTS.override.md`, then `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, and `CLAUDE.MD`. An override replaces guidance only in its own directory; guidance from other directories continues to layer.
- Classify every override as tracked owner guidance, an untracked Jihye-managed projection with valid companion metadata, or a local file without valid Jihye ownership data. Refuse to overwrite tracked or ambiguously owned files.
- Read every applicable owner source completely. Preserve symlink identity and inspect its canonical target when maintained elsewhere.
- Resolve the local exclude file with `git rev-parse --git-path info/exclude`; never assume `.git` is a directory. Record the exact root-relative projection and metadata paths as anchored exclude entries and verify each with `git check-ignore -v`.
- Build a bytewise-sorted owner-topology manifest containing each selected source path, content SHA-256, and retrievable Git revision or blob identity when available. Record a Git blob only when hashing its retrieved bytes reproduces the translated source SHA-256; otherwise record null. Include additions, moves, and deletions when comparing manifests.
- Select only canonical evidence needed to verify the blueprint, paths, commands, validation, generated-file boundaries, and architectural claims. Record its paths and content SHA-256 separately from owner sources.

If the session working directory is above the repository root, Pi will not discover repository context automatically. Resolve and check the projection manually before the displaced owner file, and require a session inside the repository before claiming automatic activation.

## Use the Managed Format

Store companion metadata under a repository-root `.jihye/` directory. Mirror the projection's repository-relative path beneath it and append `.json`, so root and scoped projections remain distinct:

```text
AGENTS.override.md         → .jihye/AGENTS.override.md.json
client/AGENTS.override.md  → .jihye/client/AGENTS.override.md.json
```

Exclude each exact metadata file, not the whole `.jihye/` directory, and do not disturb unrelated contents there. The companion contains one machine-readable JSON object:

```json
{"format":1,"contract":"translate-guidance/v1","state":"current","projection":"AGENTS.override.md","projectionSha256":"<sha256>","scope":".","piMin":"0.84.0","revision":"<git-revision-or-null>","ownerTopologySha256":"<sha256>","ownerSources":[{"path":"AGENTS.md","sha256":"<sha256>","gitBlob":"<blob-or-null>"}],"evidence":[{"path":"package.json","sha256":"<sha256>"}],"contractSha256":"<skill-sha256>","doctrineSha256":"<doctrine-sha256>"}
```

Keep provenance out of the projection itself. Pi loads the `AGENTS.override.md` guidance body but not the companion, so normal repository work does not need to read metadata; only `translate-guidance` lifecycle operations parse it. Treat the projection and companion as one ownership unit. Set `projectionSha256` to the SHA-256 of the exact guidance-file bytes so a stale companion cannot claim a replaced or manually altered override. Set `state` to `current` only after conflict reconciliation, approval, writing, and verification all succeed. A missing, invalid, mismatched, tracked, staged, or unexcluded companion makes the projection unsafe.

Use repository-root-relative POSIX paths for the projection, owner sources, and evidence. Resolve the loaded skill directory as the metadata-contract base: `contractSha256` is the SHA-256 of this `SKILL.md`, and `doctrineSha256` is the SHA-256 of `../../DOCTRINE.md` relative to it. Require both installed artifacts to be readable before initialization. If either later becomes unavailable, return **contract review required** and do not treat the projection as current. Compute `ownerTopologySha256` from sorted `source-kind<TAB>path<TAB>sha256<LF>` records. Write deterministic valid JSON. Change the format or contract identifier only when its semantics change.

Organize the projection body by authority, omitting empty sections:

```markdown
# Local Guidance Projection

## Owner Requirements
## Blueprint Brief
## Local Adaptations
```

Translate owner requirements into concise imperatives without weakening them. Put repository facts only in the evidence-backed blueprint brief. Put Jihye-specific reconciliation, explicit user decisions, and durable discoveries only in local adaptations. Normalize wording only when meaning is unchanged. Never write a projection while a substantive conflict remains unresolved.

## Initialize the Projection

1. Verify that no projection or metadata target is tracked, staged, or occupied by a file without valid Jihye ownership data.
2. Derive only the evidence-backed blueprint needed for future work. Admit each enrichment only when it is durable, evidence-backed, correctly scoped, absent from governing guidance, useful to future work, and worth its runtime context cost.
3. Create a root projection where root owner guidance exists. Create a scoped projection only where corresponding owner guidance exists or a verified local scope needs a distinct delta. Check the complete ancestor chain and explicit owner-defined precedence; no scoped projection may weaken an applicable requirement from another scope.
4. Draft a source-to-projection semantic mapping that accounts for every applicable owner instruction across the ancestor chain and labels every enrichment by evidence. Maintain a conflict register outside the proposed projection.
5. Surface each substantive conflict to the user with its authorities, practical consequence, and viable resolutions. Obtain an explicit decision, fold it into the appropriate owner requirement or local adaptation, and regenerate the mapping. Repeat until no substantive conflict remains; if the user defers one, stop without writing.
6. Show the reconciled mapping and complete proposed projection for manual verification, then pass an explicit approval gate before writing projections, metadata, or exclude entries.
7. Add only the exact projection and metadata paths to the Git-resolved `info/exclude`, create only the required `.jihye/` parent directories, then write the approved guidance body and companion metadata with state `review-required`.
8. Verify owner sources are unchanged; projections and metadata are untracked and unstaged; `git check-ignore -v` resolves each to `info/exclude`; normal `git status` omits them; and `git status --ignored` reveals them at the expected paths. Set metadata state to `current` only after these checks pass, then revalidate the companion.
9. Ask the user to run `/reload` from a session inside the repository. Do not claim the projection governs until reload and loaded-context verification succeed.

## Check Freshness

Keep check deterministic and cheap; do not retranslate the repository.

1. Re-run the version, ownership, topology, exclusion, and Git-state checks.
2. Parse every managed companion and recompute the projection fingerprint, owner manifest, topology fingerprint, selected evidence fingerprints, translator contract fingerprint, and doctrine fingerprint.
3. Return one state per projection:
   - **current** — metadata state is `current`, ownership and exclusion are safe, and all fingerprints match.
   - **reconciliation required** — metadata state is `review-required` because a mutating lifecycle operation began but did not complete, including a deferred conflict.
   - **refresh required** — owner content or topology changed, including an added, moved, or deleted source.
   - **evidence review required** — owner sources match but selected canonical evidence changed.
   - **contract review required** — the translator contract or doctrine changed.
   - **unsafe** — companion metadata is invalid or mismatched, either managed file became tracked or staged, exclusion is missing, or ownership is ambiguous.
   - **unsupported** — active Pi is older than 0.84.0.
4. When any state is not current, report the exact mismatches. Do not rely on the stale projection or proceed with affected repository work until the required refresh or review is approved, written, rechecked, and reloaded.

## Refresh by Semantic Rebase

Change only the valid companion's `state` to `review-required` before semantic review; this safety state does not authorize a projection edit. Leave it set if the operation is interrupted or a conflict is deferred, so later checks cannot report the existing projection as current.

1. Retrieve the prior owner revision only from a recorded Git blob whose bytes reproduce its recorded source SHA-256. Otherwise compare current owner sources with the prior `Owner Requirements` translation and ask for missing history when ambiguity could change meaning.
2. Diff prior and current owner guidance, including topology changes. Translate every changed instruction and preserve every unchanged applicable instruction.
3. Replay the local blueprint and adaptations onto the new owner base. Remove local duplication when owners now express it canonically; never remove evidence-backed local value merely because upstream changed nearby text.
4. Detect overlap, altered precedence, and cross-scope conflict. Resolve only from authority or canonical evidence. Surface every remaining substantive conflict to the user, obtain a decision, and fold the reconciliation into the proposal; stop without writing if any conflict is deferred.
5. Update evidence and companion metadata, then show the reconciled semantic old-source → old-projection → new-source → proposed-projection mapping.
6. Pass the approval gate, replace only Jihye-managed projection-and-companion pairs, repeat initialization verification, set metadata state to `current`, and require `/reload` plus loaded-context verification.

## Enrich or Compact

For **enrich**, accept a discovery only when it is durable, evidence-backed, correctly scoped, absent from governing guidance, useful to future work, and worth its runtime context cost. Update the local section and evidence fingerprints without changing the synchronized owner base.

For **compact**, remove stale facts, owner duplication, superseded adaptations, and low-value context. Preserve every applicable owner requirement and every still-operative conflict reconciliation. Prefer higher information density over shorter text alone.

Before semantic review for either operation, set valid companion metadata state to `review-required` under the same safety-state rule as refresh. Surface and reconcile substantive conflicts before showing the final semantic delta. Pass the approval gate only after reconciliation, update companion metadata, repeat safety and freshness checks, restore state to `current`, and require reload verification.

## Propose Upstream

Prepare a narrowly scoped owner-facing proposal only for guidance that is generally useful without Jihye-specific context. Identify the owner source, rationale, and exact proposed change. Do not alter owner guidance automatically; leave any upstream edit to a separately authorized delivery boundary. Keep the local projection until the owner change lands and a refresh removes the duplication.

## Return the Result

Report the repository and operation, Pi compatibility, discovered root and scoped topology, projection and metadata state and paths, source-to-projection mapping or mismatch details, reconciled decisions or conflicts still blocking a write, exact exclude file, safety verification, and reload status. Distinguish completed activation from files that are merely drafted or written.
