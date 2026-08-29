---
name: hakseup
description: Teach one subject through a learner-agreed, revisable curriculum and an adaptive learning loop with declared activity shapes, evidence-backed assessment, durable records, and modality-appropriate retention. Use when asked to teach, tutor, drill, build, resume, or review a course.
disable-model-invocation: true
---

# Hakseup

## Preserve the Learning Invariants

- Agree with the learner on the target capability, observable outcome, scope, and course shape. Treat the agreement as the course's prompt boundary and revise it with the learner as their needs or learning capability change.
- Give every activity an explicit shape and completion evidence. Let the course declare shapes beyond the initial standards.
- Declare which completion criteria the learner sees and which answer or evaluation material remains agent-facing. While an assessment is unresolved, withhold the answer and every item declared withheld unless the learner explicitly asks to see the answer. Let a declared activity defer agent consultation when that separation prevents leakage. Do not describe repository files as access-protected.
- On an explicit answer request, show the answer, record the request, and use it as calibration evidence.
- For diagnostic and practice activities, collect learner evidence before evaluating or teaching the tested gap. Allow prerequisite exposition before an activity when the curriculum calls for it.
- Base every evaluation on observed learner evidence and the declared assessment basis. Teach the evidenced gap after evaluating it.
- Adapt difficulty, support, pacing, and activity choice from recorded evidence.
- Advance only on the learner's explicit signal.
- Treat the conversation as transient. Durably capture surfaced prompts, learner attempts, notes, feedback, calibration, and the resume pointer before advancing.
- Use a retention form appropriate to the activity's modality.

## Locate the Course

Resolve the course home rather than assuming one. Follow an explicit target, then the first applicable:

1. Follow explicit user or project instructions.
2. Use the course home named by workspace-owned configuration, such as a workspace `REPO.md`.
3. Under a workspace whose guidance claims a directory for reusable learning artifacts, use that directory.
4. Propose a location and confirm it before creating one.

Place the course at `<course home>/<course-slug>/`. Derive the slug from the subject in lowercase kebab-case; ask when ambiguous. Never hardcode a course home into this workflow.

Read `references/course.md` completely for the artifact roles and declaration templates. Follow the course home's guidance when it adds constraints.

For an existing course, pass this read gate before revising its scope, authoring, or resuming an activity: read `CURRICULUM.md`, `notes.md`, `learner.md`, and the artifacts declared for the current activity.

## Scope the Curriculum

Establish through dialogue:

- the capability the learner wants, what it is for, and the observable outcome that ends the course,
- the included and excluded scope, ordered module arc, and how the learner may revise them,
- the learner's current capability, evidenced by prior work or a short diagnostic when appropriate,
- the starting difficulty, pacing, support preferences, and learner-controlled advancement,
- the activity shapes each module uses and each shape's artifacts, response channel, learner-visible completion criteria, withheld evaluation material, validation, completion evidence, and retention form,
- the learner's environment and any authoritative sources or source repositories.

Adopt already-demonstrated capability rather than re-teaching it. Confirm the scope, then create or revise `CURRICULUM.md` with the learner.

Prefer authoring an activity just before surfacing it when calibration should shape the activity. Allow pre-authored inventories when coverage, comparability, or sourced correctness benefits more; select and sequence their items adaptively.

Treat sources as a per-activity or per-module choice. Make claims about a source repository only from code read in this session, cite the file and construct in a declared agent-facing source artifact, and use a `scout` subagent when locating repository patterns would otherwise load the main-agent context.

## Run the Common Activity Lifecycle

Repeat this lifecycle independently of activity shape:

1. **Prepare** the activity from the curriculum, calibration record, declared shape, and sources. Verify the prompt as its declaration requires before surfacing it.
2. **Surface** the prompt and learner-visible completion criteria through the declared response channel. Persist exactly what the learner receives, but withhold the answer and every evaluation item declared withheld while its assessment remains unresolved.
3. **Support** only when requested or previously agreed. Give one hint tier at a time without revealing the answer, and record support used.
4. **Collect** the learner's attempt or other declared evidence before evaluating a diagnostic or practice activity.
5. **Evaluate** the evidence against the declared assessment basis and validation. Consult and verify the assessment basis now when the activity deferred agent access until after the attempt. Report the result and decisive evidence, distinguishing a misconception from a slip or tooling failure.
6. **Teach** the evidenced gap, answer follow-up questions, and capture durable notes with the evidence supporting them.
7. **Gate** on the learner: ask whether to continue, revisit, change the activity shape, or revise the course.
8. **Capture** the attempt, evaluation, feedback, calibration change, completion state, and resume pointer before the next activity.

If the learner explicitly asks for the answer before resolving the assessment, record the request, reveal the answer through the response channel, mark the assessment accordingly, and use the request and subsequent evidence for calibration. Never disguise an answer as a hint.

## Use Conceptual Questions

Use this standard shape for verbal, written, diagrammatic, or other conceptual responses unless the course declares a better shape.

- Surface a question with its expected response form and completion evidence.
- Accept the response through the declared channel and preserve it as the learner's attempt.
- Assess it against an agent-facing, withheld answer, rubric, source set, or combination of them. Cite the decisive source or criterion in the evaluation.
- Probe uncertain understanding with a follow-up or transfer question when the declared validation requires it.
- Retain learning through an appropriate form such as spaced recall, a question variant, explanation, comparison, or concept map.

A conceptual question inventory may be pre-authored. Keep inventory coverage and source lineage explicit, but select questions using the learner's calibration record.

## Use Executable Tasks

Use this standard shape when runnable behavior is the learning evidence.

- Surface only the task contract, such as its signature, docstring, and unchanged check block. Treat the checks as learner-visible completion criteria; keep the reference solution and uncovered probes withheld. Do not preview the target concept, traps, failure modes, or preferred idiom.
- Verify the check block against a minimal reference solution before surfacing it, confirm the expected assertions pass, then discard the reference solution.
- Treat the learner's working file as learner-owned. Never write an implementation there; add behavior-free scaffolding only on request.
- Wait for the learner's attempt, run the unchanged checks, then construct and run at least one relevant probe the checks do not cover. Report observed outputs under Validation.
- Review correctness, what the evidence implies about the learner's model, and then useful idiom or design improvement.
- On an explicit solution request, verify a minimal solution against the unchanged checks, show it through the response channel only, record the request, and leave the learner's working file untouched.
- Use standalone executable retention when it fits the environment. Build variants from recorded gaps rather than reusing a check the learner has already passed.

## Calibrate the Course

Use completion evidence, attempts, support used, explicit answer requests, follow-up probes, retention results, and learner feedback as calibration evidence.

Increase challenge or reduce support after consistently independent success. Reduce challenge, add prerequisite exposition, change shape, or narrow the step when evidence shows a misconception or excessive load. Do not infer capability from self-report alone when a proportionate diagnostic is available.

Record every meaningful adjustment and its trigger in `learner.md`. Keep `CURRICULUM.md` honest when the agreed level, pacing, module arc, or activity declarations change.

## Capture Notes and Feedback

Keep the common roots distinct:

- `CURRICULUM.md` holds the learner-agreed capability, outcome, scope, declarations, status, and resume pointer.
- `notes.md` holds durable concept and internals write-ups with the evidence that established them.
- `learner.md` holds attempts or their artifact pointers, support and answer requests, observed gaps, calibration changes, retention results, and learner feedback.

Use the course-declared activity artifacts for surfaced prompts, full attempts, assessment material, source lineage, and retention material. Keep agent-facing assessment material separate from learner-facing notes, and label it withheld rather than protected.

Collect feedback at meaningful completions and whenever the learner offers it. Record it precisely enough to change the course.

## Build and Run Retention

Generate or schedule the declared retention form at meaningful module or course intervals from `learner.md` and the activity record.

- Exercise the same capability through changed material rather than replaying a completed assessment.
- Include recorded gap patterns without treating isolated slips as habits.
- Verify retention material and its assessment basis before use.
- Evaluate later retention evidence through the common lifecycle and feed new gaps back into calibration.

Do not force executable review tests onto non-executable learning. When executable retention is declared, keep it standalone where the environment permits and point failures to the relevant `notes.md` section.

## Deliver the Course Record

Persist the current activity artifacts and resume pointer whenever the learner pauses; a pause alone does not require repository delivery.

Follow the course home's guidance for meaningful configured delivery checkpoints. When a checkpoint uses version control, treat its course record as a delivery boundary in the course home's repository, pass the read gate for its Git guidance, and apply the workspace Git workflow without restating repository mechanics here.

Include only the artifacts owned by the checkpoint. Preserve learner-owned files unchanged, and report the checkpoint and durable resume state before continuing.
