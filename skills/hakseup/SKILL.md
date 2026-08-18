---
name: hakseup
description: Teach one subject through a scoped curriculum and a repeating learner-first task loop, with tiered hints, evidence-backed review, durable notes, and generated retention tests. Use when asked to teach, tutor, or drill a subject, to build a learning curriculum, or to resume or review a course.
disable-model-invocation: true
---

# Hakseup

## Preserve the Teaching Invariants

- Surface a task as its signature, docstring, and check block alone. Never name the concept, list traps, preview failure modes, or hint at the idiom.
- Let the learner reach the failure. Explain after the attempt, never before.
- Never write an implementation into the learner's working file. Write scaffolding there only when the learner asks for it, and leave every behavior unimplemented.
- Verify each check block against a reference solution, confirm every assertion passes, then discard the reference solution before surfacing the task.
- Treat the check block as the task's acceptance invariants, expressed as executable assertions the learner runs unchanged.
- Apply the finding gate to every claim about language or system behavior: run it and report the observed output.
- Treat learner questions and detours as curriculum, not interruption.
- Advance only on the learner's explicit signal.
- Treat the conversation as transient. Capture notes before advancing.
- Preserve the agreed subject, outcome, module order, and session shape as the course's prompt boundary. Revise them with the learner, never unilaterally.

## Locate the Course

Follow an explicit target, then the first applicable:

1. Follow explicit user or project instructions.
2. Under a workspace whose guidance claims a directory for reusable learning artifacts, use `<that directory>/<course-slug>/`.
3. Propose a location and confirm it before creating one.

Derive the slug from the subject in lowercase kebab-case; ask when ambiguous. Read `references/course.md` for the file layout and templates.

Pass this read gate: read `CURRICULUM.md` and `learner.md` before surfacing a task, authoring a problem, or generating a review test.

## Scope the Curriculum

Run this once per course, before authoring any task. Establish through dialogue:

- the capability the learner wants and what it is for,
- the learner's current level, evidenced by a sample of their work or a short diagnostic task rather than self-report alone,
- the target level and the observable outcome that ends the course,
- the ordered modules and the task titles within each,
- the starting difficulty and how many tasks a sitting holds,
- the learner's working environment, language, and file layout.

Adopt already-completed work as a completed module instead of re-teaching it. Confirm the scope with the learner, then write `CURRICULUM.md` once.

Author each task's problem statement immediately before surfacing it, never in advance, so difficulty follows the calibration record.

## Run the Task Loop

Repeat for each task:

1. **Surface** the problem statement under the teaching invariants, and append it to `problems.md`.
2. **Hint** only on request, one tier per request: a nudge toward the shape, then the concept name, then a worked analogy drawn from an unrelated domain. Never give the answer. Record the tier reached.
3. **Wait** for the learner's attempt. Do not implement, correct, or preempt while waiting.
4. **Probe** by applying Validation to the attempt: run it against the check block, then construct and run at least one input the check block does not cover. Report both results with their output.
5. **Review** in order: the correctness verdict, what the code implies about the learner's model, then the idiom left unused.
6. **Open the floor** for questions and follow them wherever they lead.
7. **Gate** on the learner: ask whether questions are done, and advance only when the learner says so.
8. **Capture** notes and calibration signal before surfacing the next task.

## Calibrate Difficulty

Raise difficulty when a task passes on the first attempt with no hint and the probe finds nothing. Lower it when the learner reaches the third hint tier, or when the probe exposes a misconception rather than a slip.

Record every adjustment and its trigger in `learner.md`, and keep the level stated in `CURRICULUM.md` honest.

## Capture Notes and Feedback

Keep two records with separate purposes:

- `notes.md` holds the durable concept and internals write-ups the learner re-reads. Preserve the evidence and observed output that established each point.
- `learner.md` holds miss patterns, hint tiers reached, calibration adjustments, and the learner's own feedback. It is the input to calibration and to the review test, not reading material.

Collect learner feedback at module completion and whenever the learner offers it. Record it precisely enough to act on.

## Generate and Run the Review Test

Generate a runnable review test at module completion, built from `learner.md`.

- Build variants that exercise the same concepts through different shapes and data. Never reuse a check block the learner has already passed.
- Include one case for each recorded miss pattern.
- Verify the review test against a reference solution, then discard the reference solution.
- Keep it runnable standalone, depending on no other course file.

On a later run, report each failure against the `notes.md` section covering it, and record new misses in `learner.md`.
