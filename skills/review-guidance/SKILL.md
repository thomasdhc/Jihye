---
name: review-guidance
description: Review the most-specific agent guidance governing one user-selected file or directory. Use parent guidance only to verify conflicts and duplication. Use when asked to audit scoped AGENTS.md, CLAUDE.md, or related agent instructions.
---

# Review Guidance

Review one most-specific guidance subject for accuracy, focus, conflicts, and justified context cost.

## Set the Prompt Boundary

Enforce that scope is required. Accept one of:

- an explicit guidance file, such as `AGENTS.md` or `CLAUDE.md`
- a source file whose governing guidance must be reviewed
- a directory or work area whose governing guidance must be reviewed

If the scope is absent or ambiguous, ask the user to set the prompt boundary before investigating. Do not default to every loaded context file, the repository root, or the whole workspace. Accept a broad prompt boundary such as "all loaded guidance" only when the user explicitly requests it.

## Resolve the Subject and Instruction Boundary

1. Resolve relative paths from the current working directory.
2. Preserve the distinction between a loaded guidance symlink and its canonical target. Review maintained content at the canonical target and identify the loaded path it governs.
3. Treat an explicit guidance file as the review subject.
4. For a source file or directory, locate its nearest, most-specific guidance and treat that file as the review subject.
5. Remember that parent guidance files are references, not additional review subjects; use them only for inheritance, conflicts, and duplication.
6. State the resolved prompt boundary, subject file, and reference files before presenting findings.
7. Ask the user to choose when more than one guidance file is equally specific.

Respect the instruction boundary: repository-owned guidance governs repository-specific commands, architecture, and conventions; workspace- or user-owned guidance governs its broader safeguards and environment. Report a conflict instead of silently choosing one authority.

Do not review unrelated Markdown files, README files, documentation trees, or every instruction file merely because they are discoverable.

## Inspect the Evidence

Read the subject file completely. Inspect only enough scoped implementation, current commands, and reference guidance to verify candidates against these criteria:

1. **Accuracy and staleness** — identify paths, commands, architecture, workflows, or tool behavior that no longer match the scoped implementation.
2. **Scope and focus** — identify instructions outside the selected scope or detail whose maintenance and context cost clearly exceeds its practical value. Do not treat length alone as a defect.
3. **Conflicts and redundancy** — identify instructions that contradict parent guidance or repeat it without a scope-specific reason.
4. **Missing durable guidance** — identify omitted recurring decisions or constraints only when repository or session evidence shows that the omission is likely to cause future mistakes.

Do not propose guidance for one-off activity, transient state, obvious code behavior, or speculative preferences.

## Apply the Finding Gate

Report a candidate as a finding only when it passes this finding gate:

1. Verify it against current files, commands, or governing guidance.
2. Tie it to a concrete mistake, conflict, maintenance burden, or context-cost impact within the prompt boundary.
3. Cite the smallest useful line range in the subject file.
4. Give a concrete, scope-preserving correction.

Do not report style preference, unsupported speculation, or an observation about a reference file that has no practical effect on the subject. If no candidate passes the finding gate, report no findings.

Keep ownership of every finding and verdict in the calling agent. If subagents gather or challenge evidence, verify every decisive claim directly before reporting it.

## Return the Verdict

Present findings first, ordered by practical impact. For each finding, state the subject-file location, verified problem, practical impact, and concrete correction. Keep reference-file observations subordinate to their effect on the subject.

Conclude with a proportionate verdict: either the guidance is fit for the selected scope or specific corrections are warranted. A verdict follows from findings and must never be stronger than their evidence.

Keep edits behind an approval gate. Open that approval gate only when the user explicitly asks to revise the guidance; a request to review or audit does not authorize edits.
