---
name: coordinate
description: Build and run a compact parent-side execution skeleton for multi-stream or dependency-heavy delegation. Use before the first subagent call when sequencing, collision control, isolation, or integration is non-trivial. Skip one bounded task and obvious independent direct fan-out.
---

# Coordinate

## Build the Execution Skeleton

Keep the skeleton in the parent agent's working context. Do not delegate its creation.

Record:

1. **Outcomes** — Separate independently deliverable outcomes and give each an acceptance invariant and delivery boundary.
2. **Calls** — Choose the smallest useful specialist calls and the evidence each must return.
3. **Dependencies** — Mark required ordering, unlocking evidence, and uncertainties that could change the sequence.
4. **Safe parallel groups** — Group calls that neither depend on nor invalidate one another; put dependent calls later.
5. **Collision controls** — Identify overlapping files, generated artifacts, services, ports, external records, and other mutable resources. Serialize conflicting access and note required worktree isolation.
6. **Blocked work** — Mark calls waiting on an applicable loaded gate.
7. **Integration and validation** — Set reconciliation order and focused checks for each outcome and the integrated result.

Prefer a small dependency map and ready-to-run briefs over narrative planning. Revisit the skeleton only when evidence changes it.

## Run the Skeleton

Immediately launch the first actionable parallel group in the same turn that establishes the skeleton. Do not return only a plan while safe work is ready.

- When a gate blocks write work, launch useful allowed read-only work.
- Ask for user input only when no actionable group can proceed.
- After each group, reconcile decisive evidence, update dependencies and collision risks, and launch the next actionable group.
- Stop delegating when the parent can finish the remaining bounded work more directly.
