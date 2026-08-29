# Course Artifact Roles and Templates

## Artifact Model

Every course keeps three stable common roots:

```text
<course home>/<course-slug>/
  CURRICULUM.md    agreed course contract, status, declarations, resume pointer
  notes.md         durable learner-facing explanations and evidence
  learner.md       learner evidence, calibration, feedback, and artifact pointers
  <declared activity artifacts>
```

The course declares activity artifacts instead of inheriting a fixed module layout. It may use flat files, module directories, an external response channel with durable transcripts, executable files, diagrams, or other modality-appropriate records. Keep paths relative to the course root where files are used.

Keep these artifact roles distinct:

- **Course contract:** agreed capability, outcome, scope, module arc, revisability, and activity declarations.
- **Activity record:** the exact surfaced prompt, learner attempt, support, answer request, evaluation, feedback, completion state, and next action.
- **Assessment material:** learner-visible completion criteria plus the answer, rubric, reference solution, probes, sources, or other basis used to evaluate. Declare which items the learner sees and which remain agent-facing and withheld. A declaration may defer agent consultation until after an attempt. Repository placement does not make material access-protected.
- **Learning notes:** learner-facing explanations backed by observed evidence.
- **Calibration record:** evidence-derived changes to difficulty, support, pacing, shape, and sequence.
- **Retention material:** the modality-appropriate later exercise and its result.

For each activity shape, declare:

- its open-ended `shape` name and purpose,
- prompt, attempt, assessment, source, and retention artifacts as applicable,
- the response channel,
- the learner-visible completion criteria, the evaluation material that remains withheld, and whether agent consultation is deferred until after an attempt,
- validation and completion evidence,
- the retention form.

The conceptual-question and executable-task shapes below are starting shapes, not a closed enum. A course or module may declare another shape and its mechanics through the same contract.

## CURRICULUM.md

```markdown
---
name: <course> curriculum
subject: <subject>
level: <current calibration>
---

# <Course>

## Capability and Outcome

<the learner-agreed capability, what it is for, and the observable completion condition>

## Scope and Revisability

<included and excluded scope, plus how the learner may revise the course>

## Learning Environment

<response channels, tools, constraints, and source authorities>

## Activity Declarations

### <shape name>

- Purpose: <what this shape establishes>
- Artifacts: <prompt, attempt, assessment, source, and retention paths or durable channels as applicable>
- Response channel: <conversation, file, executable workspace, diagram, or another channel>
- Assessment: <learner-visible completion criteria; answer, rubric, sources, checks, or other evaluation material; identify what remains withheld>
- Validation: <how the evaluation material and learner evidence are verified>
- Completion evidence: <observable condition>
- Retention: <modality-appropriate form>

## Modules

### 1. <module title> — <planned | active | complete>

<capability and selected activity shapes>

- [x] <activity title>
- [ ] <activity title>

## Resume

<current module and activity, durable artifact pointers, and first action of the next sitting>
```

Revise the contract with the learner when capability, scope, level, module arc, or declarations change. Do not mark a module complete until its declared completion and retention evidence exists.

## notes.md

Use one section per concept or meaningful detour. Number or anchor sections so retention records can refer to them durably.

```markdown
## <concept>

<what is true>

<Evidence: the observed response, source, command, output, or comparison that supports it>

<the consequence for the learner's model or practice>
```

Keep agent-facing assessment material out of `notes.md` while its assessment remains unresolved.

## learner.md

```markdown
# <Course> — Learner Record

## Calibration

- <date/activity> — <adjustment and evidence that triggered it>

## Evidence and Gaps

- <activity> — <attempt artifact or concise evidence; evaluation; gap or demonstrated capability>

## Support and Answer Requests

- <activity> — <hint tier, other support, or explicit answer request and its calibration effect>

## Retention

- <activity or capability> — <retention form, result, and next interval or action>

## Feedback

- <date> — <the learner's words and what changes because of them>
```

Store full prompts and attempts in their declared activity record when they would make `learner.md` unwieldy. Keep durable pointers here.

## Activity Record

Declare the path or durable channel in `CURRICULUM.md`; no filename is globally required. Preserve each event only after it occurs.

```markdown
## <activity id and title>

- Shape: <declared shape>
- Status: <prepared | surfaced | attempted | assessed | complete>

### Prompt

<exact surfaced prompt>

### Attempt

<exact learner response or pointer to learner-owned evidence>

### Support and Answer Requests

<support used; whether and when an answer was explicitly requested>

### Evaluation

<result, decisive learner evidence, assessment criterion or source, and taught gap>

### Feedback and Resume

<learner feedback, next choice, and durable next action>
```

## Conceptual-Question Shape

A typical declaration names a question inventory or just-in-time prompt record, a durable response channel, an agent-facing assessment artifact, source lineage, and a conceptual retention form.

Mechanics:

1. Surface the question, expected response form, and completion evidence without revealing its answer or assessment basis to the learner.
2. Preserve the learner's response before evaluation for diagnostic or practice questions.
3. Consult the assessment basis now when its declaration deferred agent access, then compare the response with the declared answer, rubric, and authoritative sources; cite the decisive criterion or source.
4. Use a follow-up or transfer question when validation requires stronger evidence.
5. Teach evidenced gaps and retain the capability through a declared form such as spaced recall, variants, explanations, comparisons, or concept maps.

A pre-authored inventory may keep questions, coverage tags, source lineage, and agent-facing answers together or in separate declared artifacts. Such material is withheld from the learner during unresolved assessment, and its declaration may defer agent consultation; it is not access-protected. Use pre-authorship when coverage, comparability, or sourced correctness benefits; otherwise prefer just-in-time authorship for adaptive calibration.

## Executable-Task Shape

A typical declaration names a prompt record, learner-owned working file, learner-visible unchanged executable checks, agent-facing reference material and probes, probe evidence, and an executable retention artifact. These are required only when this shape declares them.

Mechanics:

1. Surface the task contract without teaching the target implementation.
2. Verify unchanged checks against a temporary reference solution and discard that solution before surfacing the task.
3. Preserve learner ownership of the working file; never place an implementation there.
4. Run the learner attempt against unchanged checks and at least one relevant probe, preserving observed output.
5. Evaluate from that evidence before teaching the gap or unused idiom.
6. Reveal a verified solution only on explicit request, record the request for calibration, and keep the learner's working file untouched.
7. Prefer standalone executable retention where the environment permits, using variants derived from recorded gaps rather than passed checks.

## Other Declared Shapes

Declare another shape whenever the capability needs different mechanics, such as a lab, discussion, design critique, simulation, observation, or performance. Define its artifacts, response channel, assessment basis, validation, completion evidence, and retention form. Apply the common lifecycle without forcing conceptual-question or executable-task artifacts onto it.

## Source Lineage

When an activity depends on external material or repository conventions, declare an agent-facing source artifact and record enough lineage to re-derive the activity:

```markdown
- `<source or path>` — `<construct or claim>`: <what it establishes and which activity uses it>
```

Keep source lineage separate from learner-facing notes unless the source itself is part of what the learner should retain.
