---
name: coordinate
description: Coordinate multi-stream or dependency-heavy work before delegation. Use when multiple subagent calls require decisions about dependencies, delivery boundaries, safe parallelism, shared resources, isolation, approval gates, or integration. Skip one bounded task and obvious independent direct fan-out.
---

# Coordinate

Build and conduct a compact execution skeleton in the parent agent's context, then start useful work immediately.

## Decide Whether to Coordinate

Skip formal coordination for one bounded task or an obvious direct fan-out of independent calls with no meaningful delivery-boundary, dependency, collision, isolation, approval, or integration question; launch those calls directly in parallel.

Otherwise, use formal coordination before the first subagent call when the work has one or more of these characteristics:

- distinct feature or independently deliverable outcomes whose branch or pull-request boundaries need a decision
- several likely subagent calls with dependencies or staged handoffs
- streams whose safe parallelism is not obvious
- shared files, mutable resources, external state, or other collision risks
- concurrent implementation that may require isolated worktrees
- approval gates between investigation, editing, integration, or external writes
- non-trivial integration order or validation across streams

## Build the Execution Skeleton

Keep the skeleton concise and in the parent agent's working context. Do not delegate its creation or let planning become a separate blocking workstream.

Identify:

1. **Outcomes and delivery boundaries** — Name each distinct feature or independently deliverable outcome and its acceptance condition. Keep separate outcomes on separate branch, worktree, and pull-request boundaries; keep one outcome's implementation, tests, and supporting documentation together.
2. **Likely calls** — Estimate the smallest useful set of specialist calls, including any later verification or challenge pass. Assign each call a bounded purpose and expected evidence.
3. **Dependencies** — Record what must precede what, what evidence unlocks later work, and which uncertainties could change the sequence.
4. **Safe parallel groups** — Group calls that can run in the same turn without depending on or invalidating one another. Put dependent work in later groups.
5. **Shared files and resources** — Identify overlapping files, generated artifacts, services, ports, credentials, external records, or other mutable state. Serialize conflicting access even when separate worktrees would prevent textual overlap.
6. **Worktree isolation** — Keep read-only streams in the current checkout when safe. Use isolated worktrees for concurrent write streams or separate branch/PR outcomes, and define how their results will be integrated.
7. **Approval gates** — Mark actions that still require user approval, especially edits under strict guidance, destructive operations, external writes, commits, pushes, and pull-request changes. Coordination never supplies approval by itself.
8. **Integration and validation** — Define who owns integration, the merge or reconciliation order, focused checks for each outcome, and the final cross-stream validation.

Prefer a small dependency map and ready-to-use briefs over narrative planning. Revisit the skeleton only when evidence changes it.

## Start the First Group

Immediately after identifying the skeleton, launch the first actionable parallel group in the same turn. Do not return only a plan and wait for another prompt when safe work is ready.

- If an approval gate blocks write work, launch any useful read-only investigation that is already allowed.
- Ask for approval only when no actionable group can proceed without it.
- After each group, reconcile decisive findings, update dependencies and collision risks, and launch the next newly actionable group.
- Stop expanding delegation when the parent can finish the remaining bounded work more directly.

## Keep Parent Ownership

The parent agent conducts the work. It owns the execution skeleton, briefs, approval state, source-of-truth context, conflict resolution, integration, validation, and final synthesis.

Subagents receive bounded outcomes and return concise conclusions, decisive evidence, uncertainties, and next steps. Their plans and conclusions are inputs to verify and adapt, not authority transferred away from the parent.
