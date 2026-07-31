---
name: session-digest
description: Extract and save important conversation exchanges from the current Pi session. Filters out tool noise and keeps meaningful discoveries, decisions, findings, conceptual shifts, and plans. Use when the user says "digest", "save session", "export important parts", or asks to record what happened in this session.
---

# Session Digest

Extract the important conversational flow from the current Pi session and save it as readable Markdown.

## Step 1 — Extract all exchanges

Resolve `scripts/extract_pairs.py` relative to this `SKILL.md`; do not assume the skill is installed under `~/.pi` or any other fixed path. Run:

```bash
python3 <skill-directory>/scripts/extract_pairs.py
```

This outputs JSON with every user and assistant message from the active branch in order.

## Step 2 — Select important exchanges

Keep exchanges that represent:

- **Discoveries** — something unexpected was found or understood
- **Decisions** — an architectural, implementation, or workflow choice
- **Key findings** — results worth retaining for future work
- **Conceptual shifts** — a meaningful reframing of the problem
- **Plans** — concrete next steps agreed upon

Skip:

- Tool invocations and results
- Routine file edits and mechanical status updates
- Clarifications that produced no new insight
- Repetition already represented by a stronger exchange

Be selective. A 200-message session should usually produce 10–20 important exchanges, not 80.

## Step 3 — Determine the output path

1. Read the project's context files and follow any documented session-note convention.
2. If the project already has a session archive, use its existing location and format.
3. Otherwise, for a Git repository, default to:
   `docs/sessions/<YYYY-MM-DD>-<short-topic-slug>.md`
4. Outside a Git repository, ask the user where to save the digest.

Do not embed workstation-specific or unrelated project paths in the digest workflow.

## Step 4 — Write the digest

### Project-state format

Use this when the session primarily changed a project:

```markdown
# Session <YYYY-MM-DD> — <Topic>

## State
- <what is true now after this session>

## Findings
- <discovery or decision with enough context to be useful cold>

## Changes
- `path/to/file` — what changed and why
```

### Exchange format

Use this when preserving the discussion itself is more useful:

```markdown
# <Topic> — <YYYY-MM-DD>

> <Two or three sentence summary of the session and its outcome.>

---

## Exchanges

**User:** <message text>

**Assistant:** <response text>

---

## Key takeaways

- <important finding>
- <decision or next step>
```

## Step 5 — Hand off

- Report the saved path and summarize what was retained.
- Show the relevant diff when the digest is inside a repository.
- Do not commit unless the user explicitly asks you to commit.
