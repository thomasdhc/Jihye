---
name: review-guidance
description: Review the most-specific agent guidance governing a user-selected file or directory, using parent guidance only as reference for conflicts and duplication. Use when asked to audit scoped AGENTS.md, CLAUDE.md, or related agent instructions.
---

# Review Guidance

Evaluate whether the agent guidance governing a selected work scope is accurate, focused, non-conflicting, and worth its context cost.

## Scope Contract

A scope is required. Accept one of:

- an explicit guidance file, such as `AGENTS.md` or `CLAUDE.md`
- a source file whose governing guidance should be reviewed
- a directory or work area whose governing guidance should be reviewed

If the scope is absent or ambiguous, ask the user to select it before investigating. Do not default to every loaded context file, the repository root, or the whole workspace. Broad scopes such as "all loaded guidance" are valid only when the user explicitly requests them.

## Resolve the Guidance Chain

1. Resolve relative paths from the current working directory.
2. Preserve the distinction between a loaded guidance symlink and its canonical target. Review the maintained content at the canonical target while identifying the loaded path it governs.
3. For an explicit guidance file, treat that file as the review subject.
4. For a source file or directory, locate the nearest, most-specific guidance governing that path. Treat that guidance as the review subject.
5. Use applicable parent guidance only to understand inheritance and identify concrete conflicts or duplication. Parent guidance files are references, not additional review subjects.
6. State the resolved scope, subject file, and reference files before presenting findings. If more than one file is equally specific, ask which one is the subject.

Do not review unrelated Markdown files, README files, documentation trees, or every instruction file merely because they are discoverable.

## Review Criteria

Read the subject file completely and inspect only enough of the scoped codebase and reference guidance to verify findings.

Check for:

1. **Accuracy and staleness** — paths, commands, architecture, workflows, or tool behavior that no longer match the scoped implementation.
2. **Scope and focus** — guidance that does not apply to the selected path, or detail whose maintenance and context cost clearly exceeds its practical value. Length alone is not a defect.
3. **Conflicts and redundancy** — instructions that contradict parent guidance or repeat it without a scope-specific reason.
4. **Missing durable guidance** — recurring decisions or constraints supported by repository or session evidence whose omission is likely to cause future mistakes.

Do not propose documenting one-off activity, transient state, obvious code behavior, or speculative preferences.

## Evidence and Output

- Verify claims against current files and commands rather than judging prose in isolation.
- Cite the subject file and specific lines for each finding.
- Explain the practical impact and suggest a concrete correction.
- Report no finding when the guidance is already useful and accurate.
- Keep observations about reference files subordinate to their impact on the selected subject.
- Do not edit guidance unless the user explicitly asks after reviewing the findings.
