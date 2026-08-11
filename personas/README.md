# Jihye Personas

The `personas/` tree distributes reusable global guidance, workspace policy, local-configuration templates, and portable subagent definitions.

## Layout

| Path | Purpose |
|---|---|
| `JIHYE.md` | Own universal runtime behavior and delegation policy. |
| `JIHYE_strict.md` | Add an edit-and-write approval gate without changing the base persona body. |
| `WORKSPACE.md` | Add workspace resolution, local-environment, and read-gate policy. |
| `DEVELOPMENT.md` | Add repository orientation and validation workflow. |
| `GIT.md` | Add branch, worktree, commit, push, and request workflow. |
| `templates/` | Provide factual templates for local `REPO.md` and `USERNAME.md`. |
| `subagents/` | Define portable, bounded roles that inherit loaded policy. |

Treat `personas/subagents/` as the single canonical source for bundled subagent definitions. The extension reads this directory directly; do not install a duplicate definition set.

Bundled definitions select `model_tier: standard` or `model_tier: deep` instead of pinning a provider-specific model. Read the root [`README.md`](../README.md) for tier maps and override precedence. Use `model:` only in an override that must pin one exact model.

## Install the Guidance Chain

Pi packages do not install context files automatically. Use the two symlink commands in the root [`README.md`](../README.md).

- Verify that both destinations do not exist before linking.
- Inspect and remove obsolete symlinks first; never overwrite a regular context file.
- Link `JIHYE_strict.md` instead of `JIHYE.md` when every edit or write must pass an approval gate.
- Run `/jihye-setup` after linking. Confirm that both guidance locations are managed and loaded, `workspace_profile` is `standard` or `strict`, and the two local environment files are listed.

After both links resolve, remove obsolete workspace links to `CLAUDE.md`, `DEVELOPMENT.md`, `ENVIRONMENT.md`, and `GIT.md`, plus any separately installed personas skill link. Keep these machine-local configuration files as regular files at the workspace root:

```text
REPO.md
USERNAME.md
```

Initialize them from `templates/` when needed. Never link machine-specific configuration into Jihye.

## Guidance Resolution

Pi loads global and workspace context independently; neither persona imports the other. `JIHYE.md` is the canonical owner of universal runtime behavior. The workspace and workflow files add only their environment- or task-specific deltas.

- Treat the **workspace root** as the location of local `REPO.md` and `USERNAME.md` configuration.
- Treat the **policy directory** as the location of the workspace profile and its sibling `DEVELOPMENT.md` and `GIT.md` files.
- Treat subagent task briefs as task-specific context and authorization, never as replacement policy; bundled roles rely on applicable system and loaded context guidance.

The `jihye-setup` extension supplies these locations as `workspace_directory` and `personas_directory`. Profiles use those facts directly rather than resolving symlink paths. Markdown links do not import Pi context; each profile opens its own read gates explicitly.

## Skills

Jihye loads package-level skills from `skills/` through its package manifest. Read the root [`README.md`](../README.md) for the current list.

Do not install duplicate skill sets in `~/.pi/agent/skills` or `~/.agents/skills`; duplicate names produce discovery warnings.

## Safety

Never add secrets, credentials, `.env` files, or workstation authentication material to this directory.
