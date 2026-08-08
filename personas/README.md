# Jihye Personas

Reusable global instructions, workspace policy, local-configuration templates, and portable subagent specifications distributed with Jihye.

## Layout

| Path | Purpose |
|---|---|
| `JIHYE.md` | Default global Pi instruction profile. |
| `JIHYE_strict.md` | Strict profile requiring approval before edits or writes. |
| `WORKSPACE.md` | Workspace entry point, installed as workspace-root `AGENTS.md`. |
| `DEVELOPMENT.md` | Repository orientation and validation workflow. |
| `GIT.md` | Branch, worktree, commit, push, and pull-request policy. |
| `templates/` | Templates for workspace-local `REPO.md` and `USERNAME.md`. |
| `subagents/` | Portable default subagent definitions loaded by Jihye's bundled subagent extension. |

`personas/subagents/` is the single canonical source for Jihye's bundled subagent definitions. The extension references this directory directly; no agent-definition symlink or duplicate copy is installed.

Bundled definitions declare `model_tier: standard` or `model_tier: deep` instead of a provider-specific model, so they follow the provider backing the parent session. Tier maps and override rules are documented in the root [`README.md`](../README.md). Pin `model:` in an override definition when one exact model is required.

## Install the guidance chain

Pi packages do not install context files automatically. Configure two symlinks after installing Jihye. These commands expect both destinations not to exist; inspect and remove obsolete symlinks first, and never overwrite a regular context file.

```bash
JIHYE=/path/to/Jihye
WORKSPACE=/path/to/workspace

ln -s "$JIHYE/personas/JIHYE.md" ~/.pi/agent/AGENTS.md
ln -s "$JIHYE/personas/WORKSPACE.md" "$WORKSPACE/AGENTS.md"
```

Use `JIHYE_strict.md` as the global target when explicit approval should be required before every edit or write.

After the two links resolve correctly, remove obsolete workspace `CLAUDE.md`, `DEVELOPMENT.md`, `ENVIRONMENT.md`, and `GIT.md` links plus any separately installed personas skill link. Keep these as regular, machine-local files at the workspace root:

```text
REPO.md
USERNAME.md
```

Initialize them from `templates/` when needed. Do not link machine-specific configuration back into Jihye.

## Guidance resolution

The global profile points to the workspace profile installed beside it. The workspace profile distinguishes two locations:

- **workspace root** — local `REPO.md` and `USERNAME.md` configuration;
- **policy directory** — the workspace profile plus sibling `DEVELOPMENT.md` and `GIT.md` files distributed by Jihye.

Resolve the context-file symlink to locate the policy directory. Markdown links alone are not automatic Pi context imports; the profiles explicitly instruct the agent when to read each file.

## Skills

Personas skills now live in Jihye's package-level `skills/` directory and load through the Pi package manifest:

- `examen`
- `todo`
- `vicara`

Do not install a second copied or symlinked set into `~/.pi/agent/skills` or `~/.agents/skills`; duplicate skill names produce discovery warnings.

## Safety

Do not add secrets, credentials, `.env` files, or workstation authentication files to this directory.
