---
name: todo
description: Maintain a lean project todo and completion archive. Use when planning or revising a milestone or release, adding or starting work, asking what is next, reviewing active work, or marking work complete.
---

# Todo

## Preserve the Todo Invariants

- Keep only unfinished work in the active file; archive completed work.
- Track outcomes, order, status, and links, not an activity log.
- Keep requirements, acceptance criteria, investigation notes, branch history, and operational evidence in project documentation or linked tracker.
- Never create a second todo system when a canonical one exists.
- Never write when the user asked only to discuss, review, or plan.

## Locate the Canonical Todo

Follow an explicit target, then the first applicable:

1. Follow explicit user or project instructions.
2. Under a workspace containing `todo/README.md`, follow that registry. A common layout is `<workspace>/todo/<repo-slug>.md` with archive `<workspace>/todo/done/<repo-slug>.md`.
3. Use existing repo-local `docs/todo/project.md` and `docs/todo/done.md`.
4. Preserve an existing root `TODO.md`. If completion needs an undefined archive, ask where to create it.

Otherwise, propose structured repo-local files. Derive the slug from the Git root directory in lowercase kebab-case; ask when ambiguous.

## Use the Lean Format

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

<optional essential context>

- [ ] <concise, independently finishable outcome> ([issue](https://example.invalid))
```

Use at most one nested item level. Link extensive detail instead of copying it.

Archive newest first; alter prior entries only to correct errors:

```markdown
# <Project> — Done

## YYYY-MM-DD

### <matching milestone or workstream>

- [x] <completed outcome>
```

## Perform the Operation

### Plan or Revise a Milestone

- Establish the outcome, scope, order, and unresolved decisions before writing.
- Use one `###` section with a small ordered set of finishable outcomes.
- Keep dependencies implicit unless a short note is essential.
- Link designs or tracker issues and check for overlap with active work.
- Leave owners, priorities, dates, labels, dependency schemas, and other metadata in the tracker.

### Add an Item

Place a concise outcome in the best-matching section, creating a named section when needed. Avoid duplicates; do not default roadmap work to `Misc`.

### Start an Item

Change `[ ]` to `[~]` without rewriting scope. Multiple items may be active; importance alone does not make an item active.

### Show Next or All

For next, return the first `[~]`, otherwise the first `[ ]`, with its section and inline link; report completion when neither exists. For all, display active work and count `[ ]` plus `[~]` as remaining, with a separate active count.

### Complete an Item

1. Match pending or active text liberally; ask when multiple items match.
2. Remove it from the active file.
3. Insert it as `[x]` under today's date and matching archive section.
4. Remove an empty active section and its context only when no unfinished items remain there.

After mutation, report the changed paths and items precisely.
