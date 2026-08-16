---
name: todo
description: Maintain durable future work through a lean project index, local planning records, and completion archive. Use when planning or revising a milestone or release, recording developed feature context, adding or starting work, asking what is next, reviewing active work, promoting a plan into its repository, or marking work complete.
---

# Todo

## Preserve the Planning Invariants

- Keep only unfinished outcomes in the active index; archive completed outcomes.
- Track outcome, order, status, and links in the index, not an activity log or duplicated specification.
- Treat the conversation as transient. Never compress developed future work into terse items until its consequential context is durable.
- Prefer the configured local todo system for planning records. Move a plan into its repository only when the user explicitly asks to promote it.
- Keep one canonical planning record for a workstream and link it rather than creating a second todo system.
- Preserve evidence-backed intent, decisions, acceptance invariants, unresolved questions, and useful references; omit branch history and routine operational evidence.
- Discussion alone does not authorize mutation. Write when the user asks to record, capture, add, revise, promote, start, or complete project work.

## Locate the Planning System

Follow an explicit target, then the first applicable:

1. Follow explicit user or project instructions.
2. Under a workspace containing `todo/README.md`, follow that registry. Unless it defines another layout, use:
   - active index: `<workspace>/todo/<repo-slug>.md`
   - active plans: `<workspace>/todo/plans/<repo-slug>/<topic>.md`
   - completion archive: `<workspace>/todo/done/<repo-slug>.md`
   - completed plans: `<workspace>/todo/done/plans/<repo-slug>/<topic>.md`
3. Preserve an existing repo-local system such as `docs/todo/project.md`, `docs/todo/plans/`, and `docs/todo/done.md` when it is already canonical.
4. Preserve an existing root `TODO.md`. Ask where rich planning records and completed work belong when it does not define them.

Otherwise, propose a local planning system before creating one. Derive the slug from the Git root directory in lowercase kebab-case; ask when ambiguous. Do not put local plans into a repository merely because no plan exists yet.

## Choose the Context Depth

A simple outcome may remain one standalone item when its wording preserves the essential scope and completion condition without reconstruction.

A developed workstream needs a linked planning record when implementation would otherwise have to reconstruct consequential intent, architecture, workflow, trade-offs, evidence, acceptance invariants, staged order, or unresolved decisions from chat. Read and revise an existing canonical plan before creating another.

Use only the sections the work needs:

```markdown
# <Workstream>

## Outcome
<what should become true and why>

## Context
<source-of-truth background and boundaries>

## Decisions
<settled choices and consequential trade-offs>

## Acceptance Invariants
<finite conditions the implementation must preserve or satisfy>

## Plan
<ordered outcomes or phases without duplicate status checkboxes>

## Open Questions
<unresolved decisions that can change implementation>

## References
<canonical evidence and related work>
```

Synthesize the future-work state rather than copying a transcript. Use `session-digest` when preserving the exchanges themselves is valuable, supply a todo-local destination, and link its output from the planning record or index. Do not add empty sections.

## Maintain the Lean Index

States are `[ ]` pending, `[~]` active, and `[x]` completed; `[x]` belongs only in the archive.

Prefer:

```markdown
---
name: <project> TODOs
project: <repo-slug>
---

# <Project>

## Active

### <milestone or workstream>

<essential outcome and linked planning record>

- [ ] <concise, independently finishable outcome> ([issue](https://example.invalid))
```

Use at most one nested item level. Link extensive context instead of copying it. Archive newest first; preserve an item's links when moving it:

```markdown
# <Project> — Done

## YYYY-MM-DD

### <matching milestone or workstream>

- [x] <completed outcome>
```

## Apply the Resume Test

Before finishing a planning mutation, assume the conversation is unavailable. The active index and its links must let a later session identify:

- the intended outcome and why it matters,
- the prompt and instruction boundaries,
- consequential decisions and acceptance invariants,
- unresolved decisions that gate implementation,
- and the next independently finishable outcome.

Verify every link and planning path. If a later session would need to reconstruct consequential context, preserve more context before returning.

## Perform the Operation

### Plan or Revise a Workstream

1. Establish the outcome, scope, order, acceptance invariants, and unresolved decisions.
2. Read the active index and any linked planning record; check for overlap with active work.
3. Apply the context-depth gate. Create or update a local planning record before reducing developed work to index items.
4. Use one `###` index section with a small ordered set of finishable outcomes and a visible plan link.
5. Keep dependencies implicit unless a short note is essential. Leave owners, priorities, dates, labels, and dependency schemas in the tracker when one governs them.
6. Apply the resume test.

### Add an Item

Place a simple, independently finishable outcome in the best-matching section. Avoid duplicates and do not default roadmap work to `Misc`. When the request contains developed context, follow the workstream operation instead of discarding that context.

### Promote a Planning Record

Promote only on explicit user request:

1. Resolve the repository's canonical documentation location and read its governing guidance.
2. Adapt the local record to the repository's established format without dropping intent, decisions, or acceptance invariants.
3. Write the repository record and verify its content.
4. Update active and archived todo links to the promoted record.
5. Remove the local record only after the destination and every updated link are durable.

### Start an Item

Change `[ ]` to `[~]` without rewriting scope. Multiple items may be active; importance alone does not make an item active. Return the linked planning record with the started outcome.

### Show Next or All

For next, return the first `[~]`, otherwise the first `[ ]`, with its section and planning link. Read the link when needed to report an unresolved gate or the next finishable outcome accurately. Report completion when neither exists.

For all, display active work and count `[ ]` plus `[~]` as remaining, with a separate active count. Preserve workstream links in the response.

### Complete an Item

1. Match pending or active text liberally; ask when multiple items match.
2. Remove it from the active index.
3. Insert it with its links as `[x]` under today's date and matching archive section.
4. Remove an empty active section and its context only when no unfinished items remain there.
5. When no active item references a local plan, move it to the resolved completed-plan location; do not move promoted or still-shared context.
6. Rewrite and verify the archive link after a plan move rather than assuming the registry uses the default mirrored layout.

After mutation, report every changed path, item, and planning record precisely.
