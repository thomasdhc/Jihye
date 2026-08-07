---
name: vicara
description: Orchestrate subagents to explore an existing repository, write a resumable markdown opportunity report, and identify high-impact work grounded in repo evidence.
disable-model-invocation: true
---

# Vicara

Vicara means inquiry or investigation; this skill uses repo evidence and delegated exploration to find high-impact work.

Use this skill to explore an existing repository and identify valuable work: refactors, bug fixes, tests, docs, workflow improvements, features, cleanup, or anything else the repo itself suggests.

This is an orchestration skill. The calling agent maps the repo, delegates bounded investigations to subagents, reconciles their findings, ranks opportunities, and writes a persistent markdown report that future sessions can resume from.

## Persistent Report

Create or update a markdown report. Prefer a user-provided path. If none is given, use `OPPORTUNITIES.md` at the repo root.

If the report already exists:

- read it first
- continue from `Frontier` and `Needs More Investigation`
- preserve useful prior findings
- mark stale, superseded, or resolved items instead of silently deleting them
- add a new session note

Report structure:

```markdown
# Repo Opportunity Report

## Destination

<what this pass is trying to make possible>

## Repo Snapshot

- Purpose:
- Primary languages/formats:
- Important commands:
- Major areas:
- Guidance read:
- Areas ignored or sampled lightly:

## Frontier

Open investigation streams or candidate opportunities to continue later.

- [ ] <area/question> — <why it matters; next check>

## Opportunities

### 1. <title>

- Category:
- Impact: <low | medium | high> — <why>
- Effort: <small | medium | large> — <why>
- Risk: <low | medium | high> — <why>
- Confidence: <low | medium | high> — <why>
- Agent suitability: <good | mixed | poor> — <why>
- Evidence:
  - `<path>` — <observed fact>
- Suggested first step:
- Validation:

## Needs More Investigation

- <question/area> — <what is known; what remains>

## Out of Scope

- <area> — <why>

## Session Notes

### <date/session>

- Explored:
- Subagents used:
- Key findings:
- Next recommended action:
```

## Calling Agent Role

The calling agent owns context, judgment, and the final report for this pass.

The calling agent should:

1. Read the existing report and repo guidance.
2. Build a low-resolution repo map before delegating.
3. Identify the current **Destination**: what this pass should make possible.
4. Identify the **Frontier**: promising investigation streams or candidate opportunities.
5. Delegate bounded, independent workstreams.
6. Reconcile subagent outputs into a coherent opportunity list.
7. Verify each top opportunity through direct inspection, local reproduction, or a focused reviewer pass.
8. Draft a ranking of atomic, independently actionable opportunities.
9. Give the draft top ranking a final reviewer challenge.
10. Update the report so a future session can continue cleanly.

Subagents gather evidence. They do not own the final ranking unless a later calling agent explicitly gives them their own bounded orchestration task.

## Subagent Roles

Use subagents when workstreams are independent, the repo is large, or a bounded challenge pass would improve confidence.

### `coordinator`

Use when a frontier branch is too broad for one scout but still bounded enough to hand off. A coordinator may delegate to `scout`, `researcher`, and `reviewer`, then return a synthesized branch-level finding.

Good coordinator tasks include large subsystems, mixed local/external investigations, or comparing several opportunity signals in one broad area.

### `scout`

Use for repo-local exploration:

- major directory or file-cluster reconnaissance
- execution-path tracing
- repeated-pattern checks
- validation discovery
- docs/code consistency
- TODO/FIXME/HACK triage
- locating decisive evidence without editing files

### `researcher`

Use when repo evidence points outside the repository:

- public docs
- third-party APIs or tools
- dependency behavior
- framework or language behavior
- CI/service metadata
- known external issues or lifecycle concerns

### `reviewer`

Use after candidate opportunities exist:

- challenge a specific opportunity
- test whether evidence supports claimed impact
- look for reasons the work is unsafe, already handled, poorly scoped, or lower-value than it appears

Reviewer tasks should be narrow and falsifiable.

### `worker`

Use only if the user explicitly asks to implement a selected opportunity. Implementation is separate from opportunity discovery.

## Delegation Flow

### 1. Map before delegating

Before launching subagents, the calling agent should know enough to give useful boundaries:

- repo purpose inferred so far
- guidance files read
- important commands discovered
- major areas
- low-signal areas to ignore or sample lightly
- why each delegated stream matters

### 2. Split the frontier

Choose workstreams that can be investigated independently.

Good delegation targets:

- `coordinator`: a broad but bounded frontier branch that may need multiple sub-checks
- `scout`: one repo-local area, capability, execution path, or repeated pattern
- `researcher`: one external question suggested by repo evidence
- `reviewer`: one specific opportunity claim that needs challenge

Prefer several small, independent tasks over one broad task. Use a coordinator only when the branch genuinely needs nested orchestration.

### 3. Give bounded tasks

A good subagent task includes:

```text
Investigate <bounded area/question>.

Context:
- Repo purpose inferred so far: <summary>
- Current destination: <summary>
- Why this area matters: <reason>
- What to ignore: <generated/vendor/low-signal areas>

Return:
1. Conclusion
2. Evidence with file paths, line numbers, symbols, or commands
3. Candidate opportunities, if any
4. Confidence and uncertainty
5. Suggested report updates or next verification
```

For `coordinator`, phrase the task as: "Coordinate investigation of <bounded frontier branch>. You may delegate to scouts/researchers/reviewers. Return synthesized opportunities, uncertainties, and recommended report updates."

Avoid handing off an unbounded "review everything" task.

### 4. Reconcile findings

The calling agent should:

- deduplicate overlapping findings
- check whether evidence supports impact
- separate observed facts from suggested work
- resolve conflicts by direct verification or reviewer pass
- downgrade weak findings into `Needs More Investigation`
- preserve useful continuation points in `Frontier`

### 5. Review when useful

Use a reviewer when a candidate is high-impact, surprising, risky, or evidence-sensitive.

A reviewer task should include:

- the exact claim to test
- files or areas involved
- risk questions
- what kind of evidence would change the decision

### 6. Apply final quality gates

Before finalizing the report:

1. **Verify the top findings.** Each of the top three opportunities, or every opportunity when fewer than three exist, must have decisive support from at least one of:
   - direct verification by the calling agent
   - a local reproduction or focused validation command
   - a focused reviewer verdict

   An unreviewed scout conclusion alone does not satisfy this gate. Record the verification method and result under the opportunity's `Evidence` or `Validation` field.

2. **Review the ranking as a whole.** After drafting the ranking, give a reviewer the proposed top opportunities and their decisive evidence. Ask the reviewer to challenge:
   - ordering and claimed impact
   - overlap or bundled scope
   - existing mitigations
   - implementation and validation clarity
   - credible higher-value alternatives that were overlooked

   Reconcile the reviewer verdict into the report. Split, merge, reorder, downgrade, or move findings back to `Needs More Investigation` when warranted.

## Opportunity Ranking

Each opportunity must describe one independently implementable and independently validatable change. Split findings that merely share a subsystem, motivation, or destination. Avoid umbrella opportunities whose parts have different prerequisites, risks, or validation paths.

Rank opportunities by:

1. likely value in this repository
2. strength of evidence
3. scope clarity
4. implementation safety
5. ease of validation
6. agent suitability

Useful opportunity categories include:

- bug fix
- refactor
- validation/testing
- documentation
- workflow/automation
- feature
- cleanup
- other repo-specific category

Let the repo determine which categories matter.

## Workflow

1. **Resume or initialize**
   - Read existing report if present.
   - Read repo guidance and metadata.
   - Define the current destination.

2. **Map**
   - Identify repo purpose, major areas, commands, validation artifacts, conventions, and low-signal areas.
   - Update `Repo Snapshot`.

3. **Delegate and investigate**
   - Choose the frontier.
   - Launch bounded coordinators, scouts, or researchers where useful.
   - Search and sample directly where the calling agent needs context.

4. **Reconcile and review**
   - Merge subagent findings.
   - Verify the strongest evidence.
   - Use reviewers for risky or uncertain candidates.
   - Apply the top-finding evidence gate.

5. **Rank and report**
   - Draft atomic opportunities and have a reviewer challenge the ranking as a whole.
   - Reconcile the final reviewer verdict.
   - Add or revise opportunities.
   - Move unfinished questions to `Frontier` or `Needs More Investigation`.
   - Record out-of-scope areas.
   - Add a session note.

## Final Response

After updating the report, respond briefly with:

- report path
- top 3 opportunities
- safest first task
- highest-impact task
- what to investigate next
