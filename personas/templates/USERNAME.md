# Workspace User

> Replace every `<...>` value with local configuration. Remove entries that do not apply.

Keep user-specific branch, signing, attribution, and commit-command configuration in this file. Do not move it into reusable guidance.

## Git Branch Namespace

Use `<username-or-namespace>` as the username component in `<username>/<feature>` branch names.

## Agent Commit Commands

Co-sign every agent-authored commit with a `Co-authored-by:` trailer naming the model that produced the change. Select the command by the session model, not the agent harness.

| Session model | Command | Trailer added |
|---|---|---|
| `<model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |
| `<another-model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |

Check the active session model, such as `PI_PROVIDER` and `PI_MODEL`, when it is unclear. Ask instead of guessing. Never write a trailer that does not match the generating model, and never co-sign a commit containing only human-authored changes.

Document additional signing or sign-off requirements here.
