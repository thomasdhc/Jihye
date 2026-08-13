# Guidance Authoring

How to write and revise the Markdown guidance distributed by Jihye: personas, skills, and subagent definitions. Read this before editing any file under `personas/` or `skills/`. This file is authoring guidance for contributors and maintaining agents; it is not runtime context and must not be loaded into sessions.

## Writing Principles

- Write for an LLM reader. Guidance is instruction, not documentation: prefer imperative sentences that prescribe behavior over prose that describes it.
- State hard rules as imperatives ("load and follow", "never push", "do not"). Reserve "should" for design preferences that admit trade-offs.
- Every line must either prescribe behavior or define a term. Cut lines that do neither.
- Keep gates imperative. Advisory phrasing ("should refer to") weakens a gate into a suggestion; agents skip suggestions under pressure.
- Echo glossary terms verbatim across files. Cross-file term echo is how the model links a persona trigger to a skill description to a policy file. Do not paraphrase a glossary term where the term itself fits.
- Keep configuration and environment-specific values out of reusable guidance. Local facts belong in workspace-owned files such as `REPO.md` and `USERNAME.md`.
- Keep each file's scope singular: a persona defines identity and standing behavior, a skill defines one workflow, a subagent definition defines one bounded role.

## Vocabulary Rules

- Use the glossary below as a controlled vocabulary. When a glossary term applies, use it; do not coin a synonym.
- Where a term lists qualified kinds, use the qualified form ("approval gate", "delivery boundary"). Use the bare term only for the general concept.
- Match the verb to the term's kind. Apply a domain; never pass one. Pass a gate you must satisfy, and apply a gate to the work you are evaluating. State an invariant as a condition that holds rather than a step to complete.
- Extend the glossary sparingly. A word earns an entry when it packs unique meaning, is useful across multiple files, and drift in its usage would change agent behavior. Propose additions through review, not ad hoc in a single file.
- Treat Jihye section terms as named policy domains in the main-agent context. Downstream personas and skills must invoke the exact capitalized term instead of restating universal policy; state only their scope-specific delta.

## Changing the Base Persona

`JIHYE.md` is the canonical owner of universal runtime behavior. Every downstream persona, skill, and subagent definition inherits its domains, and installed chains reach it through a symlink, so an edit takes effect in every session at the next startup with no install step and no diff shown to the user. Treat an edit to it as a change to the whole distribution.

Complete every step before handing off a base-persona change:

1. Mirror the edited body into `JIHYE_strict.md`; the strict body stays identical to the base plus its approval header.
2. Add, revise, or remove the glossary entry when the edit adds, renames, or redefines a domain.
3. Update the pinned headings and term assertions in `tests/personas.test.ts`.
4. Give a new domain at least one downstream invoker; a domain no file invokes has not earned its place.
5. Refresh the `personas/README.md` layout row when a file's ownership changes.
6. Bump the package version as the root `AGENTS.md` version rule directs.

## Glossary

**main-agent context** — the primary agent's loaded runtime context and working memory. It holds universal Jihye policy, source-of-truth task state, decisions, decisive evidence, and final synthesis; a subagent receives independently loaded policy and its bounded brief, not this context.

**Fidelity** — the project-wide invariant: preserve the established outcome, intent, prompt boundary, source-of-truth context, acceptance invariants, and required behavior throughout the work.

**Principles** — the main-agent's standing posture: collaborate by default, treat each task as part of a larger foundation, trace execution paths, root causes, and established patterns, keep communication focused, and handle files efficiently.

**Entrypoint** — the main-agent framing of a request before selecting an approach: establish the task's Fidelity by identifying the requested outcome, intent, prompt boundary, consequential assumptions, and acceptance invariants.

**Solution Architecture** — the main-agent criteria for selecting and shaping a solution: readability, simplicity, established structure, necessary refactors, alternatives, trade-offs, safe deletion, and separation of configuration from logic.

**Validation** — the main-agent policy for verifying work: repository-native commands run from the correct working directory, the narrowest relevant check while iterating, every required broader check before handoff, and honest reporting of results and checks that could not run.

**Context and Delegation** — the main-agent policy for keeping the main-agent context high-signal, deciding whether and how to delegate, briefing subagents, verifying their output, and retaining ownership.

**Safety** — the standing main-agent protections against exposing or committing secrets, credentials, environment files, workstation authentication material, or other protected data.

**gate** — a condition that must be satisfied before a class of action may begin. A gate opens on the nature of the action, never on its size or obviousness. A gate is passed once per action.

- *read gate* — required guidance must be read in the current session before the first tool call that touches the target.
- *approval gate* — explicit user approval must be given before edits, commits, destructive operations, or external writes.
- *finding gate* — an evidence threshold a conclusion must pass before it may be reported.

**boundary** — a scope limit that separates what belongs inside from what does not.

- *delivery boundary* — branch, worktree, and pull-request separation of independently deliverable outcomes.
- *prompt boundary* — the proposed or implied scope of the user's request.
- *instruction boundary* — the authority split between repository-owned and workspace- or user-owned guidance.

**invariant** — a condition that must hold true throughout and after the work, not merely at a checkpoint. A gate is passed once; an invariant is never violated. State standing rules as invariants when their force is continuous ("never push", "config stays separate from logic", "the strict persona body stays identical to the base plus its header").

- *acceptance invariant* — a finite, testable claim a change must satisfy to be accepted.

**finding** — a concrete, verified, reportable conclusion that passed its finding gate: a defect in a review, an opportunity in an investigation. Speculation, style preference, and unverified subagent conclusions are not findings.

**verdict** — the proportionate conclusion drawn from findings: a review's approve or request-changes recommendation, a reviewer subagent's challenge result. A verdict follows from findings; it is never stronger than its evidence.

**ownership** — responsibility that stays with the main or calling agent and is never transferred to a subagent: source-of-truth context, conflict resolution, integration, validation, final synthesis, and every finding and verdict. Subagent output is input to verify, not authority.

## Testing Guidance Files

- Test structure and semantics, not phrasing: files exist, required sections are present, hard invariants hold (for example, the strict persona body matches the base persona plus its header).
- Do not pin guidance prose word-for-word in tests. Wording changes with every revision; merge-request review is the write-protection gate for guidance wording.
