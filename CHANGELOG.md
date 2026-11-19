# Changelog

Version history is recorded from 0.11.0 onward, newest first. Each entry describes user-visible changes and any required migration.

## 0.11.0

### Changes

- Rename `personas/` to `guidance/`, including bundled definitions at `guidance/subagents/`.
- Rename the setup fact `personas_directory` to `guidance_directory` and the TypeScript property `personasDirectory` to `guidanceDirectory`.
- Move `GUIDANCE.md` to [`docs/guidance-architecture.md`](docs/guidance-architecture.md) and rename the policy tests to `tests/guidance.test.ts`.
- Start this changelog and require an entry whenever the package version changes.

### Migration from 0.10.0 and earlier

The old directory and setup fact have no compatibility aliases. Existing `AGENTS.md` symlinks into `personas/` become dangling when the package updates. Complete this migration before starting a new Pi session or running `/reload`; loaded guidance in an existing session does not repair the links.

1. Update the installed package. For an unpinned Git installation, run `pi update --extensions`. For a pinned installation, select the new release with `pi install git:git@github.com:thomasdhc/Jihye@v0.11.0` after its tag is published. For a local installation, update the checkout and run `npm install` there. Keep `JIHYE` below pointed at that installed package, not a separate checkout.
2. Set the absolute paths below, then inspect both links with `ls -l "$AGENT_DIR/AGENTS.md" "$WORKSPACE/AGENTS.md"`. The commands replace only symlinks whose targets exactly match the old absolute paths; they also check that the new guidance files exist. Regular files, unrelated links, and already migrated links are left untouched. If a check fails, inspect the destination and migrate a confirmed old link manually; relative or aliased targets need this inspection too. Never overwrite a regular context file.

```bash
JIHYE=/absolute/path/to/Jihye
WORKSPACE=/absolute/path/to/workspace
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

test -f "$JIHYE/guidance/JIHYE.md" &&
  test -L "$AGENT_DIR/AGENTS.md" &&
  test "$(readlink "$AGENT_DIR/AGENTS.md")" = "$JIHYE/personas/JIHYE.md" &&
  rm "$AGENT_DIR/AGENTS.md" &&
  ln -s "$JIHYE/guidance/JIHYE.md" "$AGENT_DIR/AGENTS.md"

test -f "$JIHYE/guidance/WORKSPACE.md" &&
  test -L "$WORKSPACE/AGENTS.md" &&
  test "$(readlink "$WORKSPACE/AGENTS.md")" = "$JIHYE/personas/WORKSPACE.md" &&
  rm "$WORKSPACE/AGENTS.md" &&
  ln -s "$JIHYE/guidance/WORKSPACE.md" "$WORKSPACE/AGENTS.md"
```

3. Repeat the workspace link migration for each configured workspace. Update custom guidance, workspace project todos, scripts, or integrations that reference `personas/`, `personas_directory`, `personasDirectory`, or `GUIDANCE.md` to their new names. Keep machine-local `REPO.md` and `USERNAME.md` files in place. User-global `agents/` and package-local `.pi/agents/` overrides keep their existing locations; do not copy bundled definitions there.
4. Run `/reload` or start a new Pi session, then run `/jihye-setup`. Both guidance links must report as managed and loaded, the profile must be `standard`, and the guidance directory must end in `/guidance`. Confirm the agent receives `guidance_directory` and that the workspace-local environment files are listed. Reloaded bundled-agent discovery must expose `scout`, `researcher`, `reviewer`, and `engineer` from the new directory.
