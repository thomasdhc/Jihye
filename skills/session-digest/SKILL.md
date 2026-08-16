---
name: session-digest
description: Extract and save important exchanges from the current session. Use when the user asks to digest, save, export, or record discoveries, decisions, findings, conceptual shifts, or plans.
---

# Session Digest

## Extract Exchanges

Resolve `scripts/extract_pairs.py` relative to this `SKILL.md` and run:

```bash
python3 <skill-directory>/scripts/extract_pairs.py
```

Use its JSON as the ordered user and assistant messages from the active branch.

## Select Exchanges

Retain exchanges that capture discoveries, decisions, verified findings, conceptual shifts, or agreed concrete plans. Exclude tool activity, mechanical status, fruitless clarification, and repetition represented by a stronger exchange.

Keep selection proportionate: a 200-message session usually needs 10–20 exchanges, not 80.

## Choose the Output Path

Follow the first applicable rule:

1. Use an explicit user- or caller-supplied destination.
2. Under a workspace with a canonical local todo registry, follow its planning layout; absent a defined layout, use `todo/plans/<repo-slug>/<YYYY-MM-DD>-<short-topic-slug>-session.md`.
3. Use the project's existing session archive location and format when no local planning system governs the work.
4. In a Git repository without either convention, use `docs/sessions/<YYYY-MM-DD>-<short-topic-slug>.md`.
5. Outside a Git repository, ask where to save the digest.

Derive the repository slug from the resolved Git root and ask when it is ambiguous. A todo workflow invoking this skill must supply its todo-local destination; repository promotion remains explicit.

## Write the Digest

Use project-state format when the session primarily changed a project:

```markdown
# Session <YYYY-MM-DD> — <Topic>

## State
- <what is true now>

## Findings
- <verified conclusion useful without session context>

## Decisions
- <choice and why it matters>

## Changes
- `path` — <what changed and why>
```

Use exchange format when preserving the discussion is more useful:

```markdown
# <Topic> — <YYYY-MM-DD>

> <Two or three sentence outcome summary.>

---

## Exchanges

**User:** <message>

**Assistant:** <response>

---

## Key takeaways
- <finding>
- <decision or next step>
```

## Return the Result

Report the saved path and summarize what was retained. Show the relevant diff when the digest is inside a repository.
