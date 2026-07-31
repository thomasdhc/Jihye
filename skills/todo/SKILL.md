---
name: todo
description: Manage a TODO.md file in the current project. Use when the user says things like "add this to the todo", "let's track that", "what's next", "show the todo", "mark that done", "tick that off", or asks to capture tasks, view next items, or mark items complete.
---

# Todo Skill

Manages todo files in the current project. Uses checkbox markdown (`- [ ]` / `- [x]`).

## Finding the TODO

Check in order:
1. `docs/todo/project.md` at git root — preferred structure
2. `TODO.md` at git root — legacy fallback

If neither exists, create `docs/todo/project.md` and `docs/todo/done.md`.

## Standard structure

All projects use:
- `docs/todo/project.md` — active open items only
- `docs/todo/done.md` — append-only archive of completed work

## Operations

### Add an item

- Identify the right section from context (or ask if unclear)
- Append `- [ ] <item>` under that section in `project.md`
- If no section fits, add under a `## Misc` section at the bottom (create if needed)
- Show the user what was added and where
- Ask if they want to commit

### Show next item

- Read `project.md`
- Find the first unchecked `- [ ]` item
- Show the section it belongs to and the item text
- If all items are done, congratulate and say so

### Show all items

- Read `project.md` and display it cleanly
- Summarise: X remaining

### Mark item complete

1. Find the matching `- [ ]` line in `project.md`
2. Remove it from `project.md`
3. Append `- [x] <item>` to `done.md` under the matching section (create section if needed)
4. Show both changes before committing
5. Commit: `git add docs/todo/project.md docs/todo/done.md && git commit -m "todo: complete <item>"`

### Commit changes

```bash
git add docs/todo/project.md docs/todo/done.md && git commit -m "todo: <brief description>"
```

## Format conventions

```markdown
## Section name

- [ ] Uncompleted item
- [ ] Another item
```

Sub-items nested with two-space indent:
```markdown
- [ ] Parent item
  - [ ] Sub-item
```

## Behaviour notes

- Always show the user the change before committing
- When adding, infer the section from context — don't always ask
- When marking done, be liberal with matching (partial text match is fine)
- Keep item text concise but specific enough to be actionable
