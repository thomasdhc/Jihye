# Compaction Design Landscape

This note maps the choices for changing Pi compaction in Jihye. It is based on Pi 0.84.2 and records no implementation decision.

## Landscape

Pi compaction is a lossy context checkpoint, not history deletion. The session JSONL retains the full branch, while subsequent model requests receive a generated summary plus a recent verbatim tail.

Pi owns two triggers: manual `/compact` and automatic threshold or overflow recovery when core auto-compaction is enabled. Its settings control the response reserve and approximate retained-tail size. The default path selects a valid cut point, handles split turns, updates any previous summary, summarizes with the active model, and carries forward read and modified file lists. Tool results are truncated during summary serialization.

Extensions can change each layer without patching Pi:

- `ctx.compact()` can add a trigger policy.
- `session_before_compact` can cancel compaction or replace its summary, model call, metadata, and retained boundary.
- `session_compact` can observe the saved checkpoint.
- `session_before_tree` separately controls summaries created during tree navigation.

Jihye currently adds proactive triggering in `extensions/widget/ctx-manager.ts`: it warns at 50% context use and calls `ctx.compact()` at 65%. It does not replace Pi's summary behavior. Because this policy is a widget component, disabling that component also disables Jihye's proactive trigger; Pi's core auto-compaction remains an independent installation setting.

The design therefore has separable dimensions: trigger timing, verbatim retention, checkpoint content, summarizer routing, failure recovery, configuration, and observability.

## Design Questions

1. **Ownership:** Should compaction remain part of the optional context widget, or should a focused extension own policy independently of UI?
2. **Coordination:** Which layer is authoritative for proactive triggering, and should Pi's native overflow recovery remain enabled as a fallback? How are duplicate or concurrent compactions prevented?
3. **Trigger policy:** Should thresholds use a percentage, an absolute response reserve, or both? Which values are portable across model context windows, and what may users or projects override?
4. **Retention:** How much recent context must remain verbatim? Should retention be token-, turn-, or boundary-based, and what split-turn behavior is acceptable?
5. **Checkpoint contract:** Which task-local facts must survive—outcome, prompt boundary, acceptance invariants, decisions, evidence, file state, validation, blockers, and next action? Which material should be omitted because standing guidance is rebuilt or because it is sensitive or bulky?
6. **Summarizer:** Should compaction use the active model or a dedicated cheaper model? What token budget, retry, cancellation, custom-instruction, and fallback behavior is required?
7. **Continuity:** How should repeated summaries resist drift? Should checkpoints carry a versioned structure in `details`, and should branch summaries share the same contract?
8. **Validation:** What synthetic long-session cases demonstrate faithful resume, safe overflow recovery, bounded post-compaction context, split-turn correctness, and useful reason/usage telemetry?

## References

- Pi 0.84.2: `docs/compaction.md`, `docs/extensions.md`, and `examples/extensions/custom-compaction.ts`
- Jihye trigger: [`extensions/widget/ctx-manager.ts`](../extensions/widget/ctx-manager.ts)
