---
name: todo
description: Maintain a lean project todo and completion archive. Use when planning or revising a milestone or release, adding or starting work, asking what is next, reviewing active work, or marking work complete.
---

# Todo

Maintain one lean execution index for unfinished work and one completion archive.

## Preserve the Todo Invariants

- Keep only unfinished work in the active file.
- Archive completed work instead of accumulating checked items in the active file.
- Track outcomes, order, status, and links; do not keep an activity log.
- Put requirements, acceptance criteria, investigation notes, branch history, and operational evidence in project documentation or the linked issue tracker.
- Respect the prompt boundary. Do not modify todo files when the user asks only to discuss, review, or plan.

## Locate the Canonical Todo

Follow explicit user instructions. Before touching a todo target, pass the read gate for project instructions. Then follow the first applicable convention:

1. Use the location required by user or project instructions.
2. When the Git repository is under a workspace containing `todo/README.md`, read that registry and follow its convention. A common layout is:
   - `<workspace>/todo/<repo-slug>.md`
   - `<workspace>/todo/done/<repo-slug>.md`
3. Use existing repo-local structured files:
   - `docs/todo/project.md`
   - `docs/todo/done.md`
4. Use an existing root `TODO.md` and preserve its format. If completion requires a new archive and no convention defines one, ask before creating it.

If no todo exists and no workspace convention applies, propose repo-local structured files. Derive the project slug from the Git root directory in lowercase kebab-case, ask when the result is ambiguous, and pass any applicable approval gate before creating files.

Preserve this invariant: never create a second todo system when a canonical one exists.

## Use the Lean Format

Use these states:

- `[ ]` — pending
- `[~]` — active
- `[x]` — completed; archive only

Prefer this workspace todo structure:

```markdown
---
name: <project> TODOs
project: <repo-slug>
---

# <Project>

## Active

### <milestone or workstream>

<optional one-sentence outcome or essential context>

- [ ] <concise, independently finishable outcome>
- [ ] <another outcome> ([issue](https://example.invalid))
```

Use at most one nested item level. Move paragraphs, extensive sub-items, acceptance criteria, and decision history to project documentation or an issue, then link them.

Archive completed entries by date, newest first:

```markdown
# <Project> — Done

## YYYY-MM-DD

### <matching milestone or workstream>

- [x] <completed outcome>
```

Treat prior archive entries as history; change them only to correct an error.

## Perform the Requested Todo Operation

### Plan or Revise a Milestone

1. Discuss the milestone outcome, scope, ordering, and unresolved decisions before writing.
2. Use one `###` section with a small ordered set of independently finishable outcomes.
3. Keep dependencies implicit in ordering unless a short dependency note is essential.
4. Link design documents or tracker issues instead of copying their contents.
5. Check for overlap with active work.
6. Show the proposed todo shape before writing while the prompt boundary remains unresolved.

Do not add owners, priorities, due dates, labels, dependency schemas, or issue-tracker fields. Leave that metadata in the tracker.

### Add an Item

- Place the item under the most specific existing milestone or workstream.
- Write a concise, outcome-oriented item.
- Create a named section when none fits; do not place roadmap work under `Misc` by default.
- Avoid duplicates and near-duplicates.
- Show what changed and where.

### Start an Item

- Change `[ ]` to `[~]` without rewriting the item's scope.
- Allow multiple active items, but do not mark an item active merely because it is important.

### Show Next

- Show the first `[~]` item, or the first `[ ]` item when none is active.
- Include its milestone or workstream and any inline link.
- State that all tracked work is complete when neither state exists.

### Show All

- Display active work cleanly.
- Count `[ ]` and `[~]` as remaining, and report the active count.

### Complete an Item

1. Match pending or active text liberally; ask when more than one item matches.
2. Remove the item from the active file.
3. Insert it as `[x]` under today's date and the matching archive section.
4. Remove an empty active section and its context only when no unfinished items remain there.
5. Show both changes.

## Hand Off

- Show the relevant diff or summarize changed items precisely.
- Stage only the todo files when staging is requested.
- Pass every applicable approval gate before committing. Do not commit unless the user explicitly requests it or governing project instructions require it.
