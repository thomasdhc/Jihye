# Workspace User

> Replace every `<...>` value with local configuration. Remove entries that do not apply.

Keep user-specific branch, signing, attribution, commit-command, and command-handoff configuration in this file.

## Git Branch Namespace

Use `<username-or-namespace>` as the username component in `<username>/<feature>` branch names.

## Agent Commit Commands

Co-sign every agent-authored commit with a `Co-authored-by:` trailer naming the model that produced the change. Select the command by the session model, not the agent harness.

| Session model | Command | Trailer added |
|---|---|---|
| `<model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |
| `<another-model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |

Check the active session model, such as `PI_PROVIDER` and `PI_MODEL`, when it is unclear. Never co-sign a commit containing only human-authored changes.

Document additional signing or sign-off requirements here.

## Command Handoff

Deliver a command the user must run manually as `<preferred-handoff>`, such as a copy to the local clipboard with `<clipboard-utility>` or a displayed command only. Copy the payload literally so nothing expands or executes, never read the existing clipboard, and never report a delivery that did not happen. Use a placeholder when the user must supply a secret. Remove this section when no local preference applies.
