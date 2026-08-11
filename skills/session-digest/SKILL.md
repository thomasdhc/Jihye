---
name: session-digest
description: Extract and save important conversation exchanges from the current Pi session. Use when the user says "digest", "save session", "export important parts", or asks to record meaningful discoveries, decisions, findings, conceptual shifts, or plans from this session.
---

# Session Digest

Save the important conversational flow from the current Pi session as readable Markdown.

## 1. Extract Exchanges

Resolve `scripts/extract_pairs.py` relative to this `SKILL.md`; do not assume a fixed installation path. Run:

```bash
python3 <skill-directory>/scripts/extract_pairs.py
```

Use the resulting JSON as the ordered set of user and assistant messages from the active branch.

## 2. Select Important Exchanges

Retain only exchanges that capture:

- **Discoveries** — unexpected knowledge or understanding
- **Decisions** — architectural, implementation, or workflow choices
- **Findings** — verified conclusions that passed their finding gate during the session
- **Conceptual shifts** — meaningful reframing of the problem
- **Plans** — agreed, concrete next steps

Exclude tool invocations and results, mechanical status updates, fruitless clarifications, and repetition already represented by a stronger exchange.

Keep the selection proportionate. For a 200-message session, usually retain 10–20 exchanges rather than 80.

## 3. Choose the Output Path

Before touching a project output path, pass the read gate for project context and documented session-note conventions. Then follow the first applicable rule:

1. Use the project's existing session archive location and format.
2. In a Git repository without a convention, use `docs/sessions/<YYYY-MM-DD>-<short-topic-slug>.md`.
3. Outside a Git repository, ask the user where to save the digest.

Keep workstation-specific and unrelated project paths out of this reusable workflow.

## 4. Write the Digest

Use the project-state format when the session primarily changed a project:

```markdown
# Session <YYYY-MM-DD> — <Topic>

## State
- <what is true now after this session>

## Findings
- <verified conclusion with enough context to be useful cold>

## Decisions
- <choice and the reason it matters>

## Changes
- `path/to/file` — what changed and why
```

Use the exchange format when preserving the discussion is more useful:

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

## 5. Hand Off

- Report the saved path and summarize what you retained.
- Show the relevant diff when the digest is inside a repository.
- Treat a commit as an approval gate. Commit only after the user explicitly approves it.
