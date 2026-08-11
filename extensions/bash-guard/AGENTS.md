# Bash Guard

## Intent

`bash-guard` intercepts `bash` tool calls and decides whether a command needs human approval. It exists to stop irreversible operations and enforce explicit delivery boundaries, not to classify commands broadly. Prefer a narrow, explicit rule over a clever heuristic: a false positive trains the user to approve without reading, which is worse than a missing rule.

Which commands are guarded is policy. How a command is parsed, matched, and prompted is logic. Keep them in separate modules.

## Architecture

Dependency direction is strict and acyclic: `shell.ts` → `policy.ts` → `analysis.ts` → `index.ts`, with `prompt.ts` as a leaf consumed only by `index.ts`.

- `index.ts` is the sole Pi extension entrypoint. It owns the two operating modes, the recently-aborted memory, the `--bash-guard-auto-allow` flag, the terminal-notify emission, and the re-exports that form the module's public surface.
- `policy.ts` is data only. It declares which commands are guarded, at what severity, and with which user-facing reason. It contains no matching, parsing, or control flow.
- `analysis.ts` turns a command string into a `Risk` (`severity`, `reasons`, `flaggedCommands`, `requiresInteractiveApproval`). It interprets the policy tables and owns the token-stream detectors.
- `shell.ts` is syntax only: tokenizing via `shell-quote`, splitting on operators, unwrapping `env`/`command`/assignment prefixes, extracting nested shell `-c` commands, and option/flag inspection. It knows nothing about risk.
- `prompt.ts` renders the approval dialog and depends only on the `Risk` type, so analysis stays testable without a UI.

### Operating modes

`PI_SUBAGENT_DEPTH` is read once at module load. It is `0` or unset in the main session and `>= 1` in a spawned subagent, and the two modes behave deliberately differently:

- **Main session** — full `analyzeBashCommand`, then an interactive prompt showing the exact command and working directory. Aborting remembers the exact command for 60s and auto-blocks a retry, so the model cannot loop on a refused command. With no UI, the command is blocked unless `--bash-guard-auto-allow` is set. Rules marked `requiresInteractiveApproval` cannot use that bypass: every attempt requires a fresh decision, including retries after command or system errors.
- **Subagent** — no prompting is possible (no stdin, no UI), so hosted-CLI risks, publication rules marked `requiresInteractiveApproval`, and the catastrophic `HEADLESS_BLOCKED` regex patterns are hard-blocked. Everything else is allowed through. Block reasons must tell the subagent to escalate to the parent agent rather than retry.

This asymmetry is intentional. A subagent is more restricted in what it can destroy and less restricted in what it may run unprompted.

### Policy versus detector

Most rules belong in `policy.ts` as declarative rows. A rule stays as logic in `analysis.ts` only when it is a pattern over the token stream rather than a lookup on the command name:

- `rm`/`rmdir`/`unlink` — a base reason plus accumulated sub-reasons for `-r`, `-f`, and glob expansion.
- `diskutil` — a base reason plus an additive reason for `eraseDisk`/`eraseVolume`.
- pipe-to-shell and `curl`/`wget` piped — depend on shell operators, not on the leading command.
- redirect to a system path — scans token positions.

If a new rule needs a condition the vocabulary cannot express, prefer a named detector over widening the vocabulary. A matcher language expressive enough for everything is harder to audit than the code it replaced.

## Invariants

- `policy.ts` stays free of executable logic. Normalization of policy data into matcher shapes belongs in `analysis.ts`, done once at module load, not per command.
- Reason strings are user-facing and asserted by tests. Treat them as part of the contract.
- Reason **order** is part of the output. `analyzeSegment` evaluates in a fixed sequence: hosted CLI, system-path redirect, pipe-to-shell, policy table, `rm`, `diskutil`, `curl`/`wget` pipe. Preserve it when adding a rule.
- Severity only escalates. It starts at `medium` and moves to `high` by max-wins reduction; nothing may downgrade it.
- Exact flag matching (`hasArg`) and substring matching (`argContains`) are distinct on purpose. `argContains: "-f"` catches bundled forms like `-fd`; `hasArg: "--force"` must not match `--force-with-lease`.
- The matcher must not stop at the first match. Multiple rules may contribute reasons to one segment.
- `index.ts` must remain the only entrypoint Pi discovers, and must keep re-exporting `analyzeBashCommand`, `analyzeGitHubCliCommand`, and `analyzeGitLabCliCommand`.
- Guard operations whose effects escape the session: irreversible locally, disruptive to shared systems, externally publishing a delivery boundary, or broad enough that review is cheaper than recovery. Additive, self-authored, trivially-undone writes — creating an issue, editing your own description, posting a comment — are intentionally not guarded, and reads never are. `git push`, `gh pr create`, and `glab mr create` are explicit delivery-boundary exceptions and always require interactive approval.
- `high` means unrecoverable. `medium` means recoverable but externally visible or wide-reaching. If a proposed rule fits neither, it probably should not exist.

## Adding a Rule

1. Decide policy or detector using the rule above.
2. For a hosted-CLI rule, add one line to `DANGEROUS_GITHUB_CLI_COMMANDS` or `DANGEROUS_GITLAB_CLI_COMMANDS`, keyed by the whitespace-separated subcommand path. Use the array form only when one subcommand needs several option-scoped variants.
3. For a local command, add one row to `RISKY_LOCAL_COMMANDS` in the position matching the intended reason order. Use the smallest condition that expresses the rule.
4. Write the reason as `<command form> (<consequence>)`, naming what the user loses. It is read under time pressure.
5. Consider whether the operation is also unrecoverable and implausible in automation. If so, add a `HEADLESS_BLOCKED` pattern; otherwise leave subagent behavior alone.
6. Add tests for both the guarded and the unguarded neighbor of the new rule, so the boundary is pinned.

## Changing the Analyzer

When restructuring rather than adding, prove equivalence mechanically instead of by inspection: keep the previous implementation as a reference, run both across a corpus that covers every rule and detector, and diff severity, reasons including order, and `flaggedCommands`. Guard behavior is security-relevant and the reason strings are asserted, so a passing suite alone is weak evidence for a large refactor.
