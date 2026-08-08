# Workspace User

> Replace every `<...>` value with local configuration. Remove entries that do not apply.

## Git Branch Namespace

Use `<username-or-namespace>` as the username component in `<username>/<feature>` branch names.

## Agent Commit Commands

Every agent-authored commit is co-signed with a `Co-authored-by:` trailer naming the model that produced the change. Select the command by the model backing the current session, not by the agent harness:

| Session model | Command | Trailer added |
|---|---|---|
| `<model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |
| `<another-model-family>` | `<configured-git-commit-command>` | `Co-authored-by: <name> <<email>>` |

Check the active session model, for example `PI_PROVIDER` and `PI_MODEL`, when the backing model is unclear, and ask rather than guessing. Never write a trailer that does not match the model that generated the work, and never co-sign a commit containing only human-authored changes.

Document any additional signing or sign-off requirements here.
