# Jihye Extensions

Jihye packages focused Pi extensions that register tools and commands, enforce safety boundaries, and add terminal and session behavior. They load from `extensions/` through the package manifest. Run `/reload` in an existing Pi session after installing, updating, or changing extension code or configuration.

## Catalog

| Extension | Purpose |
|---|---|
| [`bash-guard`](bash-guard/) | Interactive prompt for destructive commands and Git publication boundaries; headless hard-block in subagents. |
| [`custom-header`](custom-header.ts) | Custom Pi startup header. |
| [`jihye-setup`](jihye-setup/) | Resolve Jihye package, personas, and workspace paths and hand them to the agent as facts. |
| [`subagent`](subagent/) | Run Pi subagents as tools with portable bundled definitions and per-user overrides. |
| [`terminal-notify`](terminal-notify.ts) | Send a native desktop alert when Pi is ready for input. |
| [`voice`](voice/) | Record speech and send it to the agent as a transcribed user message. |
| [`web-fetch`](web-fetch/) | Fetch a URL and extract readable content as Markdown. |
| [`web-search`](web-search/) | Search the web through Serper. |
| [`widget`](widget/) | Companion widget with pet reactions, context management, and session identity. |
| [`worktree-health`](worktree-health/) | Read-only cleanup-candidate checks for registered and dangling worktrees. |

## Configuration and Usage

Extensions without a section below require no user configuration.

### `web-fetch` third-party fallback

`web-fetch` directly extracts public HTTP(S) content by default. Private and local network URLs are blocked, and response and tool-output sizes are bounded.

The optional Jina Reader fallback sends failed public URLs to a third-party service, so it requires explicit opt-in when starting Pi:

```bash
pi --web-fetch-jina
```

### `web-search` credentials

`web-search` reads credentials from `SERPER_API_KEY` or a local `extensions/web-search/auth.json` file:

```bash
cp extensions/web-search/auth.example.json extensions/web-search/auth.json
```

`auth.json` is gitignored and meant to stay local.

### `subagent` agent definitions

Portable default definitions are tracked in [`../personas/subagents/`](../personas/subagents/). They declare baseline and optional alternate capability tiers instead of fixed models:

| Agent | Baseline tier | Opt-in alternate tier | Thinking |
|---|---|---|---|
| `scout` | standard | — | medium |
| `researcher` | standard | — | medium |
| `reviewer` | standard | deep | medium |
| `engineer` | deep | — | high |

Alternate-provider selection is disabled by default. Without a local override, the reviewer stays on the parent provider's standard tier: OpenAI Codex uses `gpt-5.6-sol`, while Anthropic uses `claude-sonnet-5`.

Enable alternate-provider selection on one workstation by creating the gitignored `subagent/config.json`:

```json
{
  "enableAlternateProviders": true
}
```

No Pi startup flag is required. After changing the file, run `/reload` in existing sessions; newly started sessions load it automatically. When enabled, the reviewer uses its deep alternate tier: an OpenAI or OpenAI Codex parent routes to `anthropic/claude-opus-5`, while an Anthropic parent routes to `openai-codex/gpt-5.6-sol`. Other bundled agents continue to use the parent provider.

Tier and alternate-provider maps live in [`subagent/model-profiles.json`](subagent/model-profiles.json):

| Provider | standard | deep | Alternate when parent |
|---|---|---|---|
| `openai-codex` | `gpt-5.6-sol` | `gpt-5.6-sol` | `anthropic` |
| `anthropic` | `claude-sonnet-5` | `claude-opus-5` | `openai-codex` |

A model is resolved per spawn in this order:

1. an explicit `model` in agent frontmatter, so an override can pin one model exactly;
2. when `enableAlternateProviders` is `true`, `provider_strategy` is `alternate`, and the parent provider has a route, the `alternate_model_tier` entry for the routed provider;
3. the baseline `model_tier` entry for the parent session's provider;
4. the parent session's own active model, when its provider has no tier or enabled alternate map;
5. the baseline tier entry of the default provider, when no active model is known.

The same workstation config may override model maps. Existing providers may override a single tier; a new provider must supply both. Alternate routes must target a configured provider:

```json
{
  "enableAlternateProviders": true,
  "modelProfiles": {
    "providers": {
      "anthropic": { "deep": "anthropic/claude-opus-4-8" },
      "google": { "standard": "google/gemini-3-flash", "deep": "google/gemini-3-pro" }
    },
    "alternateProviders": {
      "anthropic": "google"
    }
  }
}
```

Package-local overrides in untracked `.pi/agents/` replace the portable bundled definitions in `personas/subagents/` for this checkout. Create a definition with the same frontmatter `name` in `~/.pi/agent/agents/` to override bundled agents outside this package policy. Agent directories are merged in order: bundled `personas/subagents/`, user-global `~/.pi/agent/agents/`, then package-local `.pi/agents/`. Later definitions replace the complete earlier definition, including prompt, tools, model, and thinking level. Remove the later definition to return to the previous one. User-only and package-only agent names are also loaded.

### `jihye-setup` facts

The `jihye-setup` extension resolves the installed package root, its `personas/` directory, the active global persona, and the nearest workspace root, then appends those paths to the system prompt each turn. Guidance files can therefore name `workspace_directory` and `personas_directory` without asking an agent to run `readlink` and `dirname` first. The package version stays out of the prompt. Instead, setup records an invisible `jihye-runtime` session entry when the Jihye version, persona profile, or Pi version changes, and a session-start card repeats the current summary in the terminal only. Neither entry enters the conversation.

```text
/jihye-setup            # resolved paths, guidance health, legacy leftovers
```

Workspace roots are discovered by walking up from the working directory, looking for a context file linked into `personas/` or a directory holding `REPO.md` and `USERNAME.md`. Override discovery, or hide the card, in `~/.pi/agent/jihye-setup.json` (or `$PI_CODING_AGENT_DIR/jihye-setup.json`):

```json
{
  "workspaceRoots": ["/home/me/Workspace"],
  "card": false
}
```

### `worktree-health`

`worktree-health` performs an offline, read-only check at session startup and warns only when it finds cleanup candidates. Use the command for the full report:

```text
/worktree-health          # registered and dangling worktree status
```

The extension reads the repository-checkout and isolated-worktree roots from workspace `REPO.md`. It audits registrations across canonical checkouts and repositories represented by linked worktrees, then treats clean tracked branches already contained in the local default base, clean branches whose upstream is gone and whose HEAD is contained in that local base, prunable registrations, and broken worktree `.git` pointers as candidates. Current, dirty, locked, detached, untracked, inaccessible, and unclassifiable worktrees remain protected or advisory. Bounded or unreadable discovery is reported as incomplete. The extension never fetches, prunes, removes, switches branches, or treats age alone as evidence of staleness.

### `widget`

The `widget` extension owns the below-editor companion and loads its `pi-pet`, `ctx-manager`, and `session-identity` components behind one extension interface. Disabling `widget` in Pi disables all three; use `/widget` to enable or disable individual components. Changes are saved globally to `~/.pi/agent/widget.json` (or `$PI_CODING_AGENT_DIR/widget.json`) and reload the extensions automatically.

Useful forms:

```text
/widget                         # interactive component settings
/widget status                  # show current component states
/widget pi-pet off              # disable one component
/widget session-identity on     # enable one component
/widget reset                   # enable every component
```

All components are enabled when no widget configuration exists.

#### Pi pet

`pi-pet` is a persistent, ground-up placeholder companion rendered below the editor. It uses text-free ASCII frames and distinct Pi theme colors for each lifecycle state without sending prompt, tool, command, path, or output text anywhere. Top-level subagent tool calls get their own temporary pet instances, each tracking that subagent's working, success, or error state independently. Bundled roles use compact, role-specific silhouettes; custom agents fall back to the generic cat.

| Subagent | Pet motif |
|---|---|
| `scout` | Fox with binoculars |
| `researcher` | Owl behind a book |
| `reviewer` | Inspector with a magnifier |
| `engineer` | Builder in a hard hat |

The pet artwork sits on the left, while context and session identity details are right-aligned. At runtime, each producer owns and publishes only its own state, so removing one contribution does not disable or couple the remaining components. Pi's built-in footer remains unchanged.

Current state mapping:

| Pi activity | Pet state |
|---|---|
| Session start | `idle` |
| Agent starts thinking | `thinking` |
| Tool execution starts | `working` |
| Agent settles successfully | `success` for 5 seconds, then `idle` |
| Tool error / failed turn | `error` for 1.5 seconds, then `idle` |

In direct iTerm2 sessions that allow applications to enable focus reporting, idle pets animate only while their terminal has keyboard focus. Switching to another tab, pane, window, or application pauses idle redraws so background activity indicators can settle; returning resumes the animation. Active and reaction states keep animating regardless of focus. Other environments, including terminal multiplexers, use a static idle frame.

Pet artwork and frame dimensions live in [`widget/pi-pet/assets.ts`](widget/pi-pet/assets.ts). Each state has exact-width `top`, `face`, and `bottom` rows; animated rows share the state's tick and advance through their own modular cycles. Run `npm run preview:pi-pet` from the package root to inspect every sprite and lifecycle state inside visible frame boundaries; animation cycle counts appear beside state labels. Filter either preview mode to one sprite with `--sprite default` or a bundled subagent name:

```bash
npm run preview:pi-pet -- --sprite scout
npm run preview:pi-pet:watch -- --sprite default
```

While editing artwork, run the watch command manually in a second terminal pane. It animates continuously, and saved asset or renderer changes restart, clear, and redraw the preview in place without requiring Pi `/reload`.

#### Session identities

`session-identity` automatically leases one name to each running local Pi process in round-robin order. A bundled configuration template lives in [`../examples/session-identity.json`](../examples/session-identity.json); keep personal name choices in your user configuration rather than shared documentation.

To replace them, create `~/.pi/agent/session-identity.json` (or `$PI_CODING_AGENT_DIR/session-identity.json` when using a custom agent directory):

```json
{
  "names": ["Red", "Blue", "Green"],
  "fallbackPrefix": "helper",
  "fallbackMinimumDigits": 2
}
```

The names may be any unique, non-empty labels without terminal control characters. Missing optional fallback settings use `pi-agent-01`, `pi-agent-02`, and so on. A malformed user file stops identity allocation and produces a warning instead of silently reverting to the example. Restart active Pi processes after changing the file so they release their current leases and adopt the new pool.

Leases and the round-robin cursor live under Pi's user configuration directory at `state/session-identity`; they are retained across `/reload`, `/new`, `/resume`, and `/fork`, released on normal exit, and reclaimed when a crashed owner is no longer running. Allocation uses an atomic cross-process registry lock, and malformed lease records remain occupied rather than risking duplicate names.

The leased name appears below the context status in the companion widget using Pi's teal accent color, and it remains part of the terminal tab title and notification title. An unnamed session automatically receives a display name such as `Agent One · 2026-02-19 14:32`, combining that identity with the session's original creation time in the local timezone. The name persists in Pi's built-in footer and `/resume` selector; an existing name or a later manual `/name` remains untouched.

### `voice`

`voice` captures speech from the microphone, transcribes it locally, and sends the transcript as a user message. It exists for spoken working sessions where typing is the bottleneck, so it sends by default rather than inserting text for review. While active, the companion widget shows a red `● REC` and then a yellow `● TRANSCRIBING` below the session identity.

```text
f9              # start capture; press again to stop, transcribe, and send
/voice          # same toggle, for terminals that intercept function keys
/voice status   # resolved configuration and any missing prerequisite
```

Transcription runs on the workstation through [whisper.cpp](https://github.com/ggml-org/whisper.cpp); no audio leaves the machine and no API key is involved. Recording uses ALSA `arecord`. Install the binary and one model before first use:

```bash
git clone --depth 1 https://github.com/ggml-org/whisper.cpp ~/.local/opt/whisper.cpp
cmake -S ~/.local/opt/whisper.cpp -B ~/.local/opt/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release
cmake --build ~/.local/opt/whisper.cpp/build -j --target whisper-cli
~/.local/opt/whisper.cpp/models/download-ggml-model.sh base.en
```

Those paths are the defaults. Override them, or any other setting, in `~/.pi/agent/voice.json` (or `$PI_CODING_AGENT_DIR/voice.json`):

```json
{
  "device": "hw:1,0",
  "model": "/home/me/.local/opt/whisper.cpp/models/ggml-small.en.bin",
  "threads": 8,
  "autoSend": false
}
```

| Setting | Default | Environment override | Purpose |
|---|---|---|---|
| `device` | `default` | `PI_VOICE_DEVICE` | ALSA capture device; list candidates with `arecord -L` |
| `whisperBin` | `~/.local/opt/whisper.cpp/build/bin/whisper-cli` | `PI_VOICE_WHISPER_BIN` | Transcription binary |
| `model` | `~/.local/opt/whisper.cpp/models/ggml-base.en.bin` | `PI_VOICE_MODEL` | ggml model file |
| `threads` | `4` | `PI_VOICE_THREADS` | Decoder threads |
| `autoSend` | `true` | `PI_VOICE_AUTO_SEND` | Send the transcript, or insert it into the editor for review |
| `maxSeconds` | `900` | `PI_VOICE_MAX_SECONDS` | Hard cap on one recording |

Environment values win over the file, and the file wins over the defaults. An unreadable or malformed file falls back to defaults instead of disabling the extension. A capture holding no speech is reported and discarded rather than sent.

### `terminal-notify`

`terminal-notify` detects the current terminal at runtime, so the same package works across workstations. Notification titles use the active `session-identity` name, including urgent `bash-guard` alerts:

| Terminal | Detection | Protocol |
|---|---|---|
| iTerm2 | `TERM_PROGRAM=iTerm.app` | OSC 9 |
| Tilix | `TILIX_ID` | OSC 777, with `notify-send` fallback |
| Kitty | `KITTY_WINDOW_ID` or `TERM=xterm-kitty` | OSC 99 |
| Ghostty / WezTerm | terminal-specific environment | OSC 777 |

Unknown terminals quietly receive no notification. Override detection when needed with `PI_TERMINAL_NOTIFY=iterm`, `kitty`, `tilix`, or `osc777`; disable alerts with `PI_TERMINAL_NOTIFY=off`.

When `bash-guard` opens an approval prompt, it also requests an urgent native notification and rings the terminal bell. Pushes and PR/MR creation require a fresh interactive decision for every attempt, even when non-interactive auto-allow is enabled. In iTerm2, enable **Profiles → Terminal → Show bell icon in tabs** so the exact Pi tab is marked while iTerm2 is in the foreground.

Remove any older manually installed notification extension from `~/.pi/agent/extensions/` before reloading Pi to avoid duplicate alerts. iTerm2 notification permissions and the Linux desktop notification service must also allow notifications. Some Tilix builds lack the downstream OSC 777 notification patch; Jihye detects the build status reported by `tilix --version` and falls back to `notify-send` when native notifications are disabled. The fallback requires `notify-send` and an active Linux desktop notification service.
