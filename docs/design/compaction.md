# Compaction Design Landscape

This note maps the choices for changing Pi compaction in Jihye. It is based on Pi 0.84.2 and records current constraints and open implementation decisions.

## Default Mechanics

Pi compaction is a lossy context checkpoint, not history deletion. The session JSONL remains append-only; subsequent model requests use the standing system prompt, one generated summary, and one contiguous recent tail.

1. **Trigger:** Native auto-compaction runs when `contextTokens > contextWindow - reserveTokens`, or for overflow recovery, when enabled. Manual `/compact` and `ctx.compact()` use the same pipeline. Defaults are a 16,384-token reserve and 20,000-token retained tail.
2. **Boundary:** Pi walks backward through current-branch entries until their estimated size reaches `keepRecentTokens`, then aligns to a valid user, assistant, bash, or custom-message boundary. It never cuts at a tool result. A turn larger than the target is split into a summarized prefix and verbatim suffix.
3. **Summary:** Pi serializes entries before the boundary, truncating each tool result to 2,000 characters, and asks the active model for a structured checkpoint covering goal, constraints, progress, decisions, next steps, and critical context. Repeated compactions update the previous summary; read and modified file lists are carried forward.
4. **Persistence:** Pi appends a `compaction` entry containing `summary`, `firstKeptEntryId`, token usage, and optional `details`. Older entries remain in JSONL but leave active context.
5. **Presentation:** The summary is sent on later requests as a user-role message beginning `The conversation history before this point was compacted into the following summary:` with the content inside `<summary>` tags, followed by the retained tail.

The amount summarized varies with current context size; the tail has an approximate fixed target. Post-compaction context is therefore the unchanged system prompt plus a variable summary plus roughly 20,000 recent tokens. The default normal-summary output cap is 80% of `reserveTokens`—13,107 tokens with default settings—capped by the model limit.

## Customization Surface

- Settings can enable native auto-compaction and change `reserveTokens` or `keepRecentTokens`.
- `/compact [instructions]` and `ctx.compact({ customInstructions })` append focus to the default prompt; they do not replace its schema.
- `session_before_compact` can cancel compaction or fully replace summary generation, including prompt, input selection, model, output budget, previous-summary handling, retained boundary, usage, and extension metadata.
- `session_compact` can observe the saved checkpoint; `session_before_tree` independently customizes branch summaries.
- The fixed summary wrapper has no direct setting. A `context` hook could transform its message, but changing summary generation is the narrower intervention.

Pi has no per-message or per-tool-call "never compact" flag. Moving `firstKeptEntryId` earlier also retains every later entry. Selective older content must be copied exactly into a custom checkpoint, rehydrated through extension-managed context, or declared invalid and reread.

Jihye currently warns at 50% context use and calls `ctx.compact()` at 65% from `extensions/widget/ctx-manager.ts`. This changes trigger timing only and couples proactive compaction to an optional widget component; Pi's native auto-compaction remains an independent installation setting.

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

- Pi 0.84.2: `docs/compaction.md`, `docs/extensions.md`, `examples/extensions/custom-compaction.ts`, `dist/core/compaction/{compaction,utils}.js`, and `dist/core/messages.js`
- Jihye trigger: [`extensions/widget/ctx-manager.ts`](../../extensions/widget/ctx-manager.ts)
- Related design: [System Context Design Landscape](system-context.md)
