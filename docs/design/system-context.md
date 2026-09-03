# System Context Design Landscape

This note separates Jihye's context organization from conversation compaction. The two designs meet at dynamically loaded guidance, but they should not require one mechanism to own both policy placement and checkpointing.

## Current Layers

- **Standing context:** Pi loads the global `JIHYE.md` and workspace `WORKSPACE.md` guidance through its context-file chain. This content is part of the system prompt and remains independent of compacted session messages.
- **Read-gated guidance:** `REPO.md`, `USERNAME.md`, `personas/GIT.md`, and repository or scoped guidance are read only when their gates apply. Those reads become session tool results and can cross a compaction boundary.
- **Skills:** Procedural workflows are loaded on demand and should own bounded processes rather than standing policy.
- **Task state:** Outcomes, decisions, evidence, file state, and next actions belong to the session and its checkpoints.

`JIHYE.md` currently carries many broadly useful software-development rules. Keeping all such guidance standing improves availability but increases every request's context. Moving too much behind gates saves context but creates continuity and enforcement requirements.

## Design Principles

1. Keep the always-on layer small, stable, and sufficient to establish safety, source-of-truth boundaries, and the read-gate protocol.
2. Put scope-specific policy in canonical gated files and repeatable procedures in skills; do not duplicate their full content in standing guidance.
3. Treat a gate receipt as valid only while its governing instructions are still effective. A file path in a summary is not proof that its rules remain available.
4. Preserve gated policy exactly or reread its canonical source. Do not make an LLM paraphrase authoritative.
5. Keep machine-local values outside the repository and avoid copying them into tracked configuration, telemetry, or design examples.
6. Prefer stable prompt composition so policy placement does not unnecessarily invalidate provider prompt caches.

## Design Questions

1. Which rules in `JIHYE.md` are universal invariants, which are scoped policy, and which are procedures better expressed as skills?
2. Should active gated guidance be appended to the system prompt, injected as a context message, or reread only when a governed action resumes?
3. What identifies a valid gate receipt: canonical path, content hash, scope, session epoch, or a combination?
4. When a source changes during a session, should the next action use the latest file or preserve the previously reviewed snapshot?
5. When does gated guidance deactivate—after its operation, repository change, session replacement, compaction, or explicit scope exit?
6. Which gates need mechanical enforcement rather than instruction-only compliance?
7. How will token cost, cache stability, policy availability, and unnecessary rereads be measured?

## Relationship to Compaction

The [compaction design](compaction.md) owns the transition between context epochs. This design owns what guidance is standing, gated, or procedural. Their shared invariant is that compaction cannot leave a gate recorded as passed after its governing information has become unavailable.
