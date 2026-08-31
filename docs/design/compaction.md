# Compaction Design Landscape

This note maps the choices for changing Pi compaction in Jihye. It is based on Pi 0.84.2 and records current constraints and open implementation decisions.

## Landscape

Pi compaction is a lossy context checkpoint, not history deletion. The session JSONL retains the full branch, while subsequent model requests receive a generated summary plus a recent verbatim tail.

Pi owns two triggers: manual `/compact` and automatic threshold or overflow recovery when core auto-compaction is enabled. Its settings control the response reserve and approximate retained-tail size. The default path selects a valid cut point, handles split turns, updates any previous summary, summarizes with the active model, and carries forward read and modified file lists. Tool results are truncated during summary serialization.

Extensions can change each layer without patching Pi:

- `ctx.compact()` can add a trigger policy.
- `session_before_compact` can cancel compaction or replace its summary, model call, metadata, and retained boundary.
- `session_compact` can observe the saved checkpoint.
- `session_before_tree` separately controls summaries created during tree navigation.

Pi does not provide a per-message or per-tool-call "never compact" flag. A compaction checkpoint contains one summary and one contiguous verbatim tail beginning at `firstKeptEntryId`. An extension can move that boundary earlier, but doing so also retains every later entry. Selective older content must instead be copied exactly into a custom checkpoint, rehydrated through extension-managed context, or declared invalid and reread.

Jihye currently adds proactive triggering in `extensions/widget/ctx-manager.ts`: it warns at 50% context use and calls `ctx.compact()` at 65%. It does not replace Pi's summary behavior. Because this policy is a widget component, disabling that component also disables Jihye's proactive trigger; Pi's core auto-compaction remains an independent installation setting.

The design therefore has separable dimensions: trigger timing, verbatim retention, checkpoint content, summarizer routing, failure recovery, configuration, and observability.

## Guidance Continuity

Standing context files such as Jihye's global and workspace guidance remain in Pi's system prompt independently of session compaction. Guidance loaded through read gates—including `REPO.md`, `USERNAME.md`, `personas/GIT.md`, and repository or scoped instructions—enters the session as tool results and can fall before the retained boundary. Pi's default read-file list preserves paths, not the governing instructions.

A checkpoint must never record a read gate as passed after discarding the information that made it valid. It must either preserve allowlisted guidance exactly, or invalidate the receipt and require the canonical file to be reread before another governed operation. An LLM paraphrase alone is not authoritative. Arbitrary tool output must not be pinned because it may be bulky or sensitive.

The broader question of what belongs in standing guidance, gated files, and skills is covered by the separate [system-context design](system-context.md).

## Design Questions

1. **Ownership:** Should compaction remain part of the optional context widget, or should a focused extension own policy independently of UI?
2. **Coordination:** Which layer is authoritative for proactive triggering, and should Pi's native overflow recovery remain enabled as a fallback? How are duplicate or concurrent compactions prevented?
3. **Trigger policy:** Should thresholds use a percentage, an absolute response reserve, or both? Which values are portable across model context windows, and what may users or projects override?
4. **Retention:** How much recent context must remain verbatim? Should retention be token-, turn-, or boundary-based, and what split-turn behavior is acceptable?
5. **Guidance continuity:** Should the first implementation rehydrate exact allowlisted guidance or invalidate affected gates? How should source path, hash, scope, and lifetime be tracked without retaining unrelated tool output?
6. **Checkpoint contract:** Which task-local facts must survive—outcome, prompt boundary, acceptance invariants, decisions, evidence, file state, validation, blockers, and next action?
7. **Summarizer:** Should compaction use the active model or a dedicated cheaper model? What token budget, retry, cancellation, custom-instruction, and fallback behavior is required?
8. **Continuity:** How should repeated summaries resist drift? Should checkpoints carry a versioned structure in `details`, and should branch summaries share the same contract?
9. **Validation:** What synthetic long-session cases demonstrate faithful resume, safe overflow recovery, bounded post-compaction context, split-turn correctness, and read-gate preservation or reopening?

## References

- Pi 0.84.2: `docs/compaction.md`, `docs/extensions.md`, and `examples/extensions/custom-compaction.ts`
- Jihye trigger: [`extensions/widget/ctx-manager.ts`](../../extensions/widget/ctx-manager.ts)
- Related design: [System Context Design Landscape](system-context.md)
