# Subagent

## Intent

`subagent` registers one tool that spawns a child `pi` process for a delegated task and returns only its final text. It exists to keep exploration, research, and isolated edits out of the parent's context: the child inherits no conversation, is given a restricted tool set, and reports back verbally.

One tool call runs one agent. Fan-out is the model emitting several `subagent` calls in a turn, not a batch parameter.

## Architecture

Dependency direction is strict and acyclic: `types.ts` → `config.ts` → `{discovery.ts, runner.ts}`, `types.ts` → `render.ts`, with `index.ts` on top. `models.ts` is a leaf consumed by `discovery.ts` and `index.ts`.

- `index.ts` is the sole Pi extension entrypoint; every other module is internal. It loads configuration and model profiles, scans the agent directories once at startup, builds the concurrency semaphore, and registers the `subagent` tool with its `execute`, `renderCall`, and `renderResult` handlers. It also re-exports the registration, directory, and argv helpers that form this extension's public surface.
- `types.ts` is shapes only: `AgentConfig`, `AgentProgress`, `ToolEvent`, `AgentResult`, `Details`, `ExtensionConfig`.
- `config.ts` is data and path resolution: the agent directories, the built-in tool set, the custom-tool→extension map, `config.json` loading, and pi binary resolution. No control flow beyond that. A missing `config.json` means "no overrides"; malformed content throws with its path rather than being silently ignored, matching how `models.ts` treats a bad `modelProfiles` override in the same file.
- `discovery.ts` parses agent markdown frontmatter into `AgentConfig`, validates it, merges directories, and owns the registry plus the `globalThis.__pi_subagents` bridge. Frontmatter validation lives here, not in the runner; `isKnownTool` in `config.ts` is the single definition of a usable tool name.
- `runner.ts` owns the child process end to end: argv construction, environment, spawn, event-stream parsing, abort, and output truncation.
- `render.ts` turns an `AgentResult` into TUI components, recursing into nested subagent results.
- `models.ts` owns tier→model resolution; `model-profiles.json` is its data, optionally overridden by a local `config.json` that is not part of the package. Bundled agents declare a `model_tier`, so the same definitions work whichever provider backs the parent session.
- `tools/safe-bash.ts` is not part of this graph. It is a standalone extension loaded into a child process when an agent declares the `safe_bash` tool.

## Invariants

- `globalThis.__pi_subagents` has exactly one owning module, `discovery.ts`. jiti gives each loading extension its own instance of these modules, so the global is the only cross-extension handle on the registry. Nothing else may assign it.
- `agents` in `discovery.ts` is module-local. `setAgents` exists only because importers cannot reassign a module binding; it is the sole replacement path, alongside `registerAgent`/`unregisterAgent` for single entries. Do not add a second mutation path.
- Paths in `config.ts` derive from `EXT_DIR` (this file's own directory) and are load-bearing: they locate `personas/subagents`, `.pi/agents`, the package's `bash-guard`, `web-search`, and `web-fetch` extensions, `tools/safe-bash.ts`, and this extension's own `index.ts`. Moving that resolution or the file changes those absolute paths, and the child process fails to load extensions rather than degrading.
- Agent directories are merged in the order `personas/subagents` (package), `<pi agent dir>/agents` (user), `<package root>/.pi/agents` (package-local, gitignored); later wins. The merge replaces the whole agent by name, not field by field. `getAgentDirectories` ignores its `cwd` argument, so the set does not depend on the tool call's working directory.
- `PI_SUBAGENT_ALLOWED` is read once at module load into `SUBAGENT_ALLOWLIST` in `discovery.ts` and applied in two places: `registerAgent` drops non-allowlisted registrations, and `index.ts` filters the directory scan both at startup and per `execute`. A child therefore cannot spawn an agent its parent did not grant, even by name.
- `runner.ts` owns the child-process contract:
  - The child runs `--mode json -p --no-session --no-skills --no-extensions`, then gets back only the tools its definition declares — built-ins via `--tools`, custom tools via explicit `--extension` paths. `bash` implies loading `bash-guard`.
  - Child stdout is one JSON event per line. `tool_execution_start`/`_update`/`_end` maintain `progress.recentTools` keyed by `toolCallId`; `message_end` accumulates usage and the last assistant prose. Unparseable lines are ignored, never fatal.
  - `onUpdate` is throttled to 150 ms, leading edge with a trailing call, so the final state always reaches the parent. The pending trailing call is flushed before `runSubagent` returns, so no update arrives after the tool call's final result and no timer outlives it.
  - Abort sends `SIGTERM` and escalates to `SIGKILL` after 3 s.
  - The task is inlined in argv up to 8000 characters and spilled to a temp file beyond it. The temp directory is removed after the process closes.
  - Output over `DEFAULT_MAX_BYTES` is truncated with `truncateHead` and marked `[Output truncated]`. Tool argument previews are capped at 4000 characters.
- The child's environment marks it as a subagent: `PI_SUBAGENT_DEPTH` is incremented on every spawn, and `PI_SUBAGENT_ALLOWED` is deleted before being re-set so an inherited allowlist cannot leak into a grandchild. `bash-guard` branches its entire behaviour on the depth value — interactive prompting at 0, headless hard-block of catastrophic operations at ≥ 1 — so changing how it is set changes guard behaviour, not just bookkeeping.
- `render.ts` is presentation only. It derives everything from the `AgentResult` handed to it and must not become a source of truth for progress or usage state.

## Adding an Agent

1. Add a markdown file to `personas/subagents/` with `name`, `description`, and comma-separated `tools` frontmatter. Names must be unique within a directory; a duplicate throws at load. A non-empty `description` is required, since it is what the parent model selects on. A markdown file with no `name` is skipped, so a stray `README.md` can sit in an agents directory.
2. Prefer `model_tier` (`standard` or `deep`) over a pinned `model`, so the agent follows the parent session's provider. A pinned model always wins.
3. Every tool must be in `BUILTIN_TOOLS` or `CUSTOM_TOOL_EXTENSIONS`; an unknown name throws at load rather than leaving the agent quietly without that capability.
4. If the agent gets the `subagent` tool, set `subagent_agents` to the agents it may spawn. Omitting it grants the whole registry.
5. Extend `tests/personas.test.ts`, which pins the exact bundled definition set and requires `model_tier` with no pinned `model`, and add prompt-boundary coverage in `tests/subagent.test.ts` alongside the existing coordinator and reviewer assertions.

## Changing the Runner

1. Decide whether the change is argv construction (`buildPiArgs`) or stream handling (`runSubagent`). `buildPiArgs` is exported and directly testable; assert on the produced argv and `childEnv` rather than spawning.
2. Any new tool wiring belongs in `config.ts` as a table entry, not as a branch in the runner.
3. Preserve the append-only shape of `progress.recentTools` and the `toolCallId` keying: a turn's tool calls are dispatched in parallel, so a single current-tool slot would lose events.
4. Verify depth and allowlist propagation for both a scoped and an unscoped agent, since these are what confine a nested subagent tree.

## Known Gap

The widget's pi-pet only observes the parent's coarse `tool_execution_start`/`tool_execution_end` events for the `subagent` tool call, so it shows one pet per call. The richer per-agent state the runner tracks — tool names, token usage, nested children — is streamed to the tool's own renderer but is not surfaced to the widget.
