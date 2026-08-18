# Course Layout and Templates

## Layout

```text
<course-root>/
  CURRICULUM.md        agreed scope, module arc, status, resume pointer
  problems.md          every surfaced problem statement, in order
  notes.md             durable concept and internals write-ups
  learner.md           miss patterns, hint tiers, calibration, feedback
  review-test.<ext>    generated retention test, one per completed module
  <working file>       the learner's own attempts; named by the learner
```

Keep the learner's working file out of every template. The learner owns its contents.

## CURRICULUM.md

```markdown
---
name: <course> curriculum
subject: <subject>
level: <current difficulty>
---

# <Course>

## Outcome

<the capability the learner wants, what it is for, and the observable condition that ends the course>

## Environment

<language, runtime, working file, and how the learner runs a check block>

## Session Shape

<tasks per sitting, and any standing preference the learner stated>

## Modules

### 1. <module title> — <planned | active | complete>

<one line on the capability this module establishes>

- [x] <task title>
- [ ] <task title>

### 2. <module title> — planned

- [ ] <task title>

## Resume

<module, task, and the first action of the next sitting>
```

Mark a module `complete` only after its review test exists.

## problems.md

Append each problem statement when it is surfaced, never before. Keep the statement exactly as the learner received it, so a later attempt starts from the same information.

```markdown
## <n>. <task title>

<signature and docstring>

**Check**

<the executable check block>
```

Record a hint under its problem only after it is given, tagged with its tier.

## notes.md

One section per concept or detour. Preserve the observed output that established the point; a claim without its evidence decays into an assertion the learner cannot re-verify.

```markdown
## <concept>

<what is true, stated first>

<the evidence: the command or snippet, and its real output>

<the consequence for how the learner should write code>
```

Order sections by when they arose. A learner-initiated detour is a first-class section, not an appendix to the task that triggered it.

## learner.md

```markdown
# <Course> — Learner Record

## Level

<current difficulty, the last adjustment, and its trigger>

## Miss Patterns

- <pattern stated as a habit> — <task, and what the probe or check block showed>

## Hints

- <task> — tier <n>: <what was still unclear at that tier>

## Feedback

- <date> — <the learner's words and what changes because of them>
```

State a miss pattern as a recurring habit rather than a single wrong answer; a habit generates a review-test case, an isolated slip does not.

## review-test.\<ext\>

Keep it standalone and runnable in the learner's environment with no other course file present. Structure it so a failure names the concept it came from.

```text
one callable per concept, with variant data
a runner that reports which concepts failed
a pointer from each concept to its notes.md section
```
