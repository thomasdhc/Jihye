# Track Layout and Templates

## Layout

The reading home is resolved, never assumed. Read the workflow's location ladder, then treat the
resolved home as `<track-root>`'s parent.

```text
<reading home>/<track-slug>/
  TRACK.md             agreed scope, lineage table, status, resume pointer
  notes.md             durable through-lines, numbered globally across the track
  queue.md             follow-ups, candidate readings, open questions
  reading-<n>/
    review.md          the critical read of one primary source and its detours
    sources.md         every resource cited by that reading, and what it was used for
```

Track-root files are cumulative and cross-referenced across every reading. `reading-<n>/` files are
episodic and belong to one reading only. A track adopts `reading-<n>/` when it reaches its second
reading; a single-reading track may stay flat. Number follow-ups by reading, `<reading>.<item>`.

## TRACK.md

```markdown
---
name: <track> track
subject: <subject>
---

# <Track>

## Outcome

<the understanding the reader wants, what it is for, and the observable condition that ends the
track — or that the track is standing and has none>

## Admission

<what makes a source belong to this track rather than a new one, and the agreed depth of audit>

## Lineage

| Source | Kind | Read in | Relationship |
|---|---|---|---|
| <title and link> | essay / paper / policy | reading-<n> | opens the track |
| <title and link> | paper | reading-<n> | cited by <source> for <claim> |
| <title and link> | policy | queued | supersedes <source> |

## Readings

### 1. <source short title> — <planned | active | complete>

<one line on what this reading established>

## Resume

<the next source or follow-up, and the first action of the next sitting>
```

Record a source in the lineage table when it is admitted, not after it is read. The `Relationship`
cell is what justifies its membership; a blank cell means the source belongs to a different track.

## reading-\<n\>/review.md

One file per primary source. Order it so the source's own case precedes every objection to it.

```markdown
# <source title> — <what this reading is>

<what was read, when it was published, and the vantage point it is read from>

## The source in brief

<the source's own case, in its own terms, stated at its strongest>

## Detour <n> — <cited source>

<what the cited source actually is, what the citing source claimed of it, and the audit>

### Verdict

<what survives the audit, and what the citing source was entitled to claim from it>

## Scorecard

<the source's own predictions, promises, or named falsifiers against observed outcomes, dated>

## Overall

<the verdict this reading reaches>
```

Keep a detour inside the reading that raised it. A detour is a first-class section, not an appendix.

## notes.md

One section per through-line: a conclusion that outlives the source that produced it. Number
sections globally across the track and continue the numbering into later readings, so a
cross-reference survives.

```markdown
## <n>. <the claim, stated as the heading>

<the evidence: the passage, measurement, or table, and where it is>

<at most one line on what follows from it>
```

Preserve the quoted wording that established a point. Attribute each through-line to the reading and
passage behind it, and mark one supported by a single source as a reading conclusion rather than a
generalization.

## queue.md

```markdown
# <Track> — Queue

## Follow-ups

- [ ] **<the check to run>** — <what it would settle> — from reading-<n>
- [x] <closed item> — <result> → notes.md §<n>

## Candidate readings

- <title and link> — <the relationship that admits it to the track> — from reading-<n>

## Open questions

- <question the track has not yet found a source for>
```

Never delete a closed item; a closed item records that the check was run. Mark an abandoned item
with its reason instead of removing it.

## reading-\<n\>/sources.md

```markdown
# reading-<n> — Sources

- [<title>](<url>) (<date>) — <the role it played in this reading>
```

State the role rather than the topic: primary source, the subject of a named detour, or the
supporting evidence behind a specific claim.
