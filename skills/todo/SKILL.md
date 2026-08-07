---
name: todo
description: Maintain a lean project todo and completion archive. Use when planning or revising a milestone or release, adding or starting work, asking what is next, reviewing active work, or marking work complete.
---

# Todo

Keep the todo as a lean execution index, not a design document or activity log.

## Principles

- Active files contain only unfinished work.
- Archive completed work instead of accumulating checked items in the active file.
- Track outcomes, order, status, and links.
- Keep requirements, acceptance criteria, investigation notes, branch history, and operational evidence in project documentation or the linked issue tracker.
- Respect the user's write boundary. If they ask to discuss, review, or plan without writing, do not modify todo files.

## Find the todo

Follow the first applicable convention:

1. Explicit user or project instructions.
2. A workspace todo registry. When the Git repository is under a workspace containing `todo/README.md`, read that file and use its convention. A common layout is:
   - `<workspace>/todo/<repo-slug>.md`
   - `<workspace>/todo/done/<repo-slug>.md`
3. Repo-local structured files:
   - `docs/todo/project.md`
   - `docs/todo/done.md`
4. An existing root `TODO.md`. Preserve its local format; if completion requires a new archive and no convention is documented, ask before creating one.

If no todo exists and the workspace has no convention, create the repo-local structured files. Derive the project slug from the Git root directory using lowercase kebab-case; ask if the result is ambiguous.

Never create a second todo system when a canonical one already exists.

## Format

Use these states:

- `[ ]` — pending
- `[~]` — active
- `[x]` — completed; archive only

For a workspace todo, prefer:

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

Use at most one level of nested items. If an item needs a paragraph, extensive sub-items, acceptance criteria, or decision history, move that detail to project documentation or an issue and link it.

Archive entries by completion date, newest first:

```markdown
# <Project> — Done

## YYYY-MM-DD

### <matching milestone or workstream>

- [x] <completed outcome>
```

Treat prior archive entries as history; change them only to correct an error.

## Operations

### Plan or revise a milestone

1. Discuss the milestone outcome, scope, ordering, and unresolved decisions before writing.
2. Use one `###` section and a small ordered set of independently finishable outcomes.
3. Keep dependencies implicit in ordering unless a short dependency note is essential.
4. Link a design document or tracker issues rather than copying their contents.
5. Check for overlap with existing active work.
6. Show the proposed todo shape before writing when scope is still being negotiated.

Do not add owners, priorities, due dates, labels, dependency schemas, or issue-tracker fields to the todo. The tracker owns that metadata.

### Add an item

- Put the item under the most specific existing milestone or workstream.
- Keep the wording concise and outcome-oriented.
- Create a named section when none fits; do not default roadmap work into `Misc`.
- Avoid duplicates and near-duplicates.
- Show what changed and where.

### Start an item

- Change its marker from `[ ]` to `[~]` without rewriting its scope.
- Multiple active items are allowed, but do not mark work active merely because it is important.

### Show next

- Show the first `[~]` item.
- If none is active, show the first `[ ]` item.
- Include its milestone or workstream and any inline link.
- If neither exists, say all tracked work is complete.

### Show all

- Display active work cleanly.
- Count both `[ ]` and `[~]` as remaining, and report how many are active.

### Complete an item

1. Match pending or active text liberally, but ask if more than one item matches.
2. Remove the item from the active file.
3. Insert it as `[x]` under today's date and the matching section in the archive.
4. Remove an empty active section and its context only when no unfinished items remain in it.
5. Show both changes.

## Handoff

- Show the relevant diff or clearly summarize the changed items.
- If staging is requested, stage only the todo files.
- Do not commit unless the user explicitly requests it or governing project instructions require it.
