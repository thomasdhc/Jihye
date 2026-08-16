# Local Guidance Projection and Repository Bootstrap — 2026-08-16

> Jihye will reconcile with repositories it does not own through local `AGENTS.override.md` projections and will establish canonical blueprints when bootstrapping repositories the user does own. Owner guidance is a fidelity floor, not a usefulness ceiling: a local override may become richer than its source while preserving authority and provenance.

## State

- Pi 0.84.0 introduced `AGENTS.override.md`. In each directory, it replaces that directory's `AGENTS.md` or `CLAUDE.md` while context from other directories continues to layer. Translation must refuse activation on older Pi versions, where the override is silently ignored.
- `DOCTRINE.md` is on-demand maintainer context. Skills may load it while maintaining Jihye or authoring guidance; it is not standing runtime context.
- `review-guidance` remains the narrow, read-only audit workflow.
- Two implementation skills are planned:
  - `translate-guidance` for repositories Jihye does not own.
  - `bootstrap-repository` for new repositories the user owns.

## Authority Model

A local override reconciles four distinct authorities:

| Content | Authority |
|---|---|
| Owner requirements and conventions | Owner-authored `AGENTS.md` or `CLAUDE.md` |
| Repository architecture and behavior | Implementation, configuration, tests, CI, and documentation |
| Jihye's operating method | `JIHYE.md`, `WORKSPACE.md`, and applicable skills |
| Local interpretations and discoveries | Verified findings and explicit user decisions |

Owner guidance remains authoritative about owner intent. It does not limit the completeness of Jihye's evidence-backed blueprint, operational map, validation pathways, or durable local discoveries.

A projection may clarify vague language, reconcile terminology, make implicit architecture explicit, and add useful context. It must not silently weaken an owner requirement, attribute a local preference to the owners, present an accidental implementation detail as intended architecture, or conceal a substantive conflict.

## `translate-guidance`

### Outcome

Create and maintain local, ignored `AGENTS.override.md` files that give Jihye a coherent working model of an external repository without modifying or competing with owner-authored guidance.

The override is a locally maintained guidance branch:

- Owner guidance is upstream.
- Initial translation establishes the synchronized base.
- Evidence-backed enrichment forms the local delta.
- Refresh performs a semantic rebase onto changed upstream guidance.

### Invariants

- Never modify canonical owner guidance as part of translation.
- Never commit a Jihye-generated override.
- Require Pi 0.84.0 or later before generating or activating one; report an existing unsupported projection rather than treating it as active.
- Add exact generated paths to the Git-resolved `info/exclude`, not the repository's `.gitignore`; do not assume `.git` is a directory in linked worktrees or submodules.
- Treat each submodule as a separate repository and translation boundary.
- Never overwrite a tracked override or an unmarked override not owned by Jihye.
- Preserve every applicable owner instruction, boundary, command, and invariant.
- Preserve local enrichment across source refreshes.
- Distinguish owner requirements, evidence-backed facts, local adaptations, and unresolved questions.
- Never allow a stale Jihye projection to govern silently.

### Initial Translation

1. Verify that the active Pi version supports per-directory overrides.
2. Resolve and fingerprint the complete root and scoped guidance topology, including additions, moves, and deletions.
3. Read relevant owner-authored guidance completely.
4. Inspect enough canonical evidence to verify paths, commands, validation, and architectural claims.
5. Reconcile owner guidance with Jihye's governing instruction boundary and blueprint model.
6. Produce root and scoped overrides only where corresponding owner guidance exists or a justified local scope requires one.
7. Show a source-to-projection semantic mapping for manual verification.
8. Mark the files as Jihye-managed and exclude them locally.
9. Verify that they are untracked, unstaged, and absent from normal `git status`.
10. Reload Pi so the overrides govern the active context.

### Richness

The source establishes a fidelity floor, not a usefulness ceiling. A projection may add durable, evidence-backed guidance such as:

- a complete blueprint brief,
- responsibility and dependency maps,
- canonical evidence pointers,
- narrow and broad validation pathways,
- generated-file and configuration boundaries,
- composition and extension patterns,
- known failure modes,
- scoped guidance relationships,
- and verified discoveries from previous work.

An enrichment belongs only when it is durable, evidence-backed, correctly scoped, absent from governing guidance, useful to future work, and worth its runtime context cost. Richness means higher information density, not indefinite growth.

### Provenance and Freshness

Each Jihye-managed override should contain machine-readable provenance sufficient to identify its format, owner sources, complete governing guidance topology, selected canonical evidence, translator contract, and doctrine revision. The implementation should choose the smallest evolvable marker format after override behavior is validated.

A cheap check compares content and topology fingerprints without retranslating the repository. It must detect newly added, moved, and deleted owner context files as well as changes to recorded files. A missing or changed fingerprint opens the refresh gate. Full semantic review remains appropriate when architectural evidence has changed beyond the recorded sources.

A future startup integration may expose projection health through `jihye-setup`, but the skill must work independently first.

### Semantic Rebase

When owner guidance changes:

1. Retrieve or identify the previously translated owner revision.
2. Diff it against current owner guidance.
3. Translate the changed owner instructions.
4. Replay and preserve local enrichment.
5. Detect new overlap or conflict between upstream guidance and the local delta.
6. Remove local duplication when owners now express the same guidance canonically.
7. Ask when a substantive conflict cannot be resolved from authority or evidence.
8. Regenerate the coherent override, update provenance, and reload Pi.

Subsequent checks should therefore be much cheaper than initial translation while still preserving manual point-to-point verification.

### Lifecycle

The skill should support one coherent lifecycle:

- **Initialize** — establish the first projection.
- **Check** — perform deterministic freshness checks.
- **Refresh** — semantically rebase onto upstream changes.
- **Enrich** — incorporate verified durable discoveries.
- **Compact** — remove stale, duplicated, or low-value context.
- **Propose upstream** — optionally prepare generally useful improvements for owner review without modifying source guidance automatically.

### Context Loading and Conflict Handling

An override replaces owner context only in the same directory. Context files in other directories are not replaced, and those on the active ancestor chain continue to layer, so no generated scoped projection may silently weaken an owner requirement from another scope. Follow explicit owner-defined precedence when present; otherwise describe a substantive cross-scope conflict and require direction before affected work.

Pi automatically discovers only context files on the current working directory's ancestor chain. When Jihye works from above a repository root or reads scoped guidance outside that chain, its repository read gate must resolve a governing `AGENTS.override.md` before the displaced owner file and verify the projection before relying on it.

Linguistic inconsistency may be normalized. Substantive inconsistency must remain visible. When authority and evidence cannot establish intent, the override should describe the conflict and require direction before affected work rather than silently choosing a rule.

## `bootstrap-repository`

### Outcome

Create the smallest coherent repository in which humans and agents can locate ownership, understand composition, identify canonical evidence, run validation, and extend the system without reconstructing its architecture.

Unlike translation, bootstrapping operates where the user owns the target repository. It therefore creates canonical `AGENTS.md` guidance rather than local overrides.

### Workflow

1. Establish the repository's outcome, users, stack, lifecycle, constraints, and acceptance invariants.
2. Define the intended target blueprint: placement, relationships, layers, composition, and canonical evidence.
3. Select a repository topology appropriate to that blueprint rather than imposing a universal directory template.
4. Separate source, tests, configuration, generated artifacts, and documentation according to their responsibilities.
5. Create one obvious validation entrypoint.
6. Implement a working vertical slice and test instead of leaving empty architectural placeholders.
7. Write concise root guidance containing the blueprint brief, commands, boundaries, canonical evidence, and validation expectations.
8. Add scoped guidance only where a subtree has a durable scope-specific delta.
9. Validate a cold-start workflow and every acceptance invariant.

### Constraints

- Prefer a minimal coherent structure over speculative scaffolding.
- Keep configuration separate from logic.
- Keep root guidance a navigational and architectural map rather than an encyclopedia.
- Keep repository guidance portable; do not require other agents to know Jihye's internal doctrine terminology.
- Do not create `AGENTS.override.md` in a newly owned repository without a separate compatibility need.
- Do not create layers, extension points, or documentation trees without evidence that the target blueprint requires them.

## Shared Architecture

The skills share a blueprint-and-guidance synthesis contract but retain different ownership rules:

| Existing external repository | New user-owned repository |
|---|---|
| Derive the existing blueprint from evidence | Establish the intended target blueprint |
| Preserve owner intent and invariants | Define initial intent and invariants |
| Maintain ignored local projections | Create canonical repository guidance |
| Refresh by semantic rebase | Evolve through normal repository changes |
| Never alter owner guidance automatically | Author owner guidance directly |

Keep the skills separate initially. Reuse Jihye's policy domains and vocabulary rather than introducing a shared implementation abstraction before repeated workflows demonstrate one is necessary.

## Implementation Order

1. Test `AGENTS.override.md` behavior under Pi 0.84 or later, including unsupported-version refusal, linked worktrees, submodules, and sessions started above the repository root.
2. Implement translation initialization, topology discovery, and deterministic freshness checks.
3. Add semantic rebase, enrichment, and compaction behavior.
4. Evaluate translation against repositories with nested guidance, stale commands, and substantive conflicts.
5. Add optional startup health reporting after the standalone workflow is reliable.
6. Implement repository bootstrapping using lessons from real translation fixtures.
7. Evaluate bootstrapping across several repository types and reject unnecessary topology in each.
