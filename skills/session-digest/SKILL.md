---
name: session-digest
description: Extract and save important conversation exchanges from the current pi session. Filters out tool noise and keeps only the meaningful human-level discussion — discoveries, decisions, key findings, conceptual shifts. For lada sessions, saves to lada/docs/sessions/. Use when the user says "digest", "save session", "export important parts", or asks to record what happened in this session.
---

# Session Digest

Extracts the important conversational flow from the current pi session and saves it as a readable markdown file.

## Step 1 — Extract all exchanges

Run the extraction script to get all user/assistant pairs from the active branch:

```bash
python3 ~/.pi/agent/skills/session-digest/scripts/extract_pairs.py
```

This outputs JSON with every user/assistant exchange in branch order.

## Step 2 — Filter for important exchanges

Review the pairs and select only those that represent:
- **Discoveries** — moments where something unexpected was found or understood
- **Decisions** — choices made about architecture, approach, or direction
- **Key findings** — results from experiments or analysis worth remembering
- **Conceptual shifts** — reframings of the problem or approach
- **Plans** — concrete next steps agreed on

Skip:
- Tool invocations and their results
- Routine file edits, git commits, mechanical tasks
- Clarifying back-and-forth with no new insight
- Pure status checks

Be selective — a 200-message session should produce 10–20 important exchanges, not 80.

## Step 3 — Determine output path

**Lada project sessions** (`cwd` is inside `~/Workspace/lada/` or session is clearly about lada):
- Save to `~/Workspace/lada/docs/sessions/<YYYY-MM-DD>-<short-topic-slug>.md`
- Use the existing lada session format (State / Findings / Changes)
- Commit the file: `git add docs/sessions/<file> && git commit -m "docs: session digest <slug>"`

**Nolan project sessions** (`cwd` is inside `~/Workspace/nolan/` or session is clearly about nolan):
- Save to `~/Workspace/nolan/docs/sessions/<YYYY-MM-DD>-<short-topic-slug>.md`
- Use the lada session format (State / Findings / Changes)
- Commit the file: `git add docs/sessions/<file> && git commit -m "docs: session digest <slug>"`

**rts-0 sessions** (`cwd` is inside `~/Workspace/rts-0/` or session is clearly about rts-0):
- Save to `~/Workspace/pi-conversations/rts-0/<YYYY-MM-DD>-<short-topic-slug>.md`
- Use the lada session format (State / Findings / Changes)
- **Do not commit** — rts-0 is a team repo; sessions stay local only

## Step 4 — Write the digest

### Lada session format

```markdown
# Session <YYYY-MM-DD> — <Topic>

## State
- <current state bullet — what is true now after this session>
- <current state bullet>

## Findings
- <discovery or decision with enough context to be useful cold>
- <finding>

## Changes
- `path/to/file` — description of what changed and why
- Commit: `<hash>` — <commit message>
```

### General session format

```markdown
# <Topic> — <YYYY-MM-DD>

> <2-3 sentence summary of what this session was about and what was discovered>

---

## Exchanges

**User:** <message text>

**Assistant:** <response text>

---

## Key takeaways

- <bullet point finding>
- <bullet point finding>
```
