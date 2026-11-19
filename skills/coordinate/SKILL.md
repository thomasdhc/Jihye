---
name: coordinate
description: Coordinate delegation with task-sized planning, safe parallel execution, and parent-owned validation. Use before the first subagent call, from a single bounded call to multi-stream work.
---

# Coordinate

Apply Context and Delegation in the main-agent context.

## Frame the Delegation

Choose the smallest useful delegated outcome and its acceptance invariant. Prepare a bounded brief with the goal, task-specific context, constraints, and output contract, and decide how to validate the return before launching each call.

For a single bounded call, the brief is the plan. For multi-stream work, keep a compact dependency map with independently deliverable outcomes and delivery boundaries, required ordering, safe parallel groups, and integration and validation order.

Check approval or read gates and shared mutable resources before launch. Serialize dependent or conflicting calls; use worktree isolation when required. Record these details only when applicable.

## Run the Delegation

Launch the first actionable parallel group immediately after coordination establishes safe work, in the same turn. Do not return only a plan while safe work is ready.

- When a gate blocks write work, launch useful allowed read-only work.
- Ask for user input only when required evidence is inaccessible or no actionable work can proceed.
- Verify returns, reconcile decisive evidence, and adjust remaining calls when dependencies or collision risks change.
- Stop delegating when the main-agent context already holds the evidence the remaining work would return.
