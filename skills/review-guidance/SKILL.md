---
name: review-guidance
description: Review the most-specific agent guidance governing one selected file or directory, using parent guidance only to verify conflicts and duplication. Use when asked to audit scoped AGENTS.md, CLAUDE.md, or related agent instructions.
---

# Review Guidance

Review one most-specific guidance subject for accuracy, focus, conflicts, and justified context cost.

## Resolve the Subject and Instruction Boundary

Require an explicit guidance file, source file, directory, or work area. Ask when scope is absent or ambiguous; only treat all loaded guidance as the subject when explicitly requested.

1. Resolve relative paths from the current working directory.
2. For an explicit guidance file, use that file as the subject.
3. For source or directory scope, locate its nearest, most-specific governing guidance and use that file as the subject. Apply Pi's same-directory precedence: `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`.
4. Before relying on a Jihye-managed override, apply the `translate-guidance` freshness check. Treat a stale or unsafe override as the subject when selected, but not as trusted governing context.
5. Preserve the distinction between a loaded symlink and its canonical target: review maintained content at the canonical target and identify the loaded path it governs.
6. Use parent guidance files as references for inheritance, conflicts, and duplication, never as additional subjects.
7. Ask the user to choose when multiple guidance files are equally specific after applying Pi's precedence.
8. State the resolved scope, subject, and reference files with the verdict.

Do not expand into unrelated Markdown, READMEs, documentation trees, or every discoverable instruction file.

Apply the governing instruction boundary and blueprint guidance. Report conflicts rather than silently choosing an authority.

## Inspect the Subject

Read the subject completely and inspect only enough scoped implementation, commands, and reference guidance to evaluate:

- **Accuracy and staleness** — paths, commands, blueprint briefs, workflows, or tool behavior no longer match the scoped implementation.
- **Blueprint coherence** — blueprint claims conflict with implementation evidence, omit durable context needed for the subject's scope, or repeat enclosing guidance without a scope-specific delta.
- **Scope and focus** — instructions are outside the selected scope, or their maintenance and context cost clearly exceeds practical value. Length alone is not a defect.
- **Conflicts and redundancy** — instructions contradict parent guidance or repeat it without a scope-specific reason.
- **Missing durable guidance** — repository or session evidence shows an omitted recurring decision or constraint is likely to cause future mistakes.

Exclude one-off activity, transient state, obvious code behavior, and speculative preferences.

## Apply the Finding Gate

Report a candidate only when all are true:

1. Current files, commands, or governing guidance verify it.
2. It causes a concrete mistake, conflict, maintenance burden, or context-cost impact inside the selected scope.
3. The smallest useful subject-file line range anchors it.
4. A concrete, scope-preserving correction is available.

Exclude style preferences, unsupported speculation, and reference-file observations without practical effect on the subject. If nothing passes, report no findings.

## Return the Verdict

Present findings first by practical impact. For each, give the subject location, verified problem, practical impact, and concrete correction. Keep reference observations subordinate to their effect on the subject.

Conclude that the guidance is fit for scope or that specific corrections are warranted. A review or audit remains read-only; revise guidance only when the user explicitly requests that action.
