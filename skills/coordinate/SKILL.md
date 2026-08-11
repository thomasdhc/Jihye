---
name: coordinate
description: Coordinate multi-stream or dependency-heavy work before delegation. Use when multiple subagent calls require decisions about dependencies, delivery boundaries, safe parallelism, shared resources, worktree isolation, approval gates, or integration. Skip one bounded task and obvious independent direct fan-out.
---

# Coordinate

Build and conduct a compact execution skeleton in the parent agent's context, then start useful work immediately.

## Decide Whether to Coordinate

Skip formal coordination for one bounded task or an obvious direct fan-out of independent calls when no meaningful dependency, delivery boundary, collision, worktree isolation, approval gate, or integration decision exists. Launch those calls directly in parallel.

Coordinate before the first subagent call when you must decide any of the following:

- delivery boundaries for distinct features or independently deliverable outcomes
- dependencies, staged handoffs, or evidence that unlocks later work
- safe parallelism across several likely calls
- access to shared files, mutable resources, or external state
- worktree isolation for concurrent implementation
- approval gates between investigation, editing, integration, or external writes
- integration order or validation across streams

## Build the Execution Skeleton

Keep the skeleton concise in the parent agent's working context. Do not delegate its creation or turn planning into a separate blocking workstream.

Identify:

1. **Outcomes and delivery boundaries** — Name each separate outcome and its acceptance invariant. Give each separate outcome its own delivery boundary across its branch, worktree, and pull request; keep one outcome's implementation, tests, and supporting documentation together.
2. **Likely calls** — Choose the smallest useful set of specialist calls, including any later verification or challenge pass. Give each call a bounded purpose and expected evidence.
3. **Dependencies** — Record required ordering, evidence that unlocks later work, and uncertainties that could change the sequence.
4. **Safe parallel groups** — Group calls that can run in the same turn without depending on or invalidating one another. Put dependent work in later groups.
5. **Shared files and resources** — Identify overlapping files, generated artifacts, services, ports, credentials, external records, and other mutable state. Serialize conflicting access even when separate worktrees prevent textual overlap.
6. **Worktree isolation** — Keep read-only streams in the current checkout when safe. Use isolated worktrees for concurrent write streams or separate delivery boundaries, and define how to integrate their results.
7. **Approval gates** — Mark every applicable approval gate, including those required for edits, destructive operations, external writes, commits, pushes, or pull-request changes. Never treat coordination as opening an approval gate.
8. **Integration and validation** — Assign integration ownership, set the merge or reconciliation order, and define focused checks for each outcome plus final cross-stream validation.

Prefer a small dependency map and ready-to-use briefs over narrative planning. Revisit the skeleton only when evidence changes it.

## Start the First Group

Immediately after identifying the skeleton, launch the first actionable parallel group in the same turn. Do not return only a plan when safe work is ready.

- If an approval gate blocks write work, launch useful read-only investigation that is already allowed.
- Ask for approval only when no actionable group can proceed without it.
- After each group, reconcile decisive evidence, update dependencies and collision risks, and launch the next actionable group.
- Stop delegating when the parent can finish the remaining bounded work more directly.

## Keep Parent Ownership

Preserve ownership as an invariant: The parent agent conducts the work and retains the execution skeleton, briefs, approval state, source-of-truth context, conflict resolution, integration, validation, and final synthesis.

Give subagents bounded outcomes and request concise conclusions, decisive evidence, uncertainties, and next steps. Verify and adapt their output; never transfer ownership to them.
