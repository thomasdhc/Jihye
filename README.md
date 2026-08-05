# Pi Extensio

A personal, installable collection of extensions and skills for the [Pi coding agent](https://pi.dev).

## Extensions

| Extension | Purpose |
|---|---|
| `bash-guard` | Interactive prompt for destructive bash and GitHub/GitLab CLI commands; headless hard-block in subagents |
| `ctx-manager` | Context usage status bar + auto-compaction at 65% |
| `custom-header` | Custom Pi startup header |
| `doc-guardian` | Watches `AGENTS.md` / `CLAUDE.md` for bloat and reminds you to review docs |
| `project-info` | Footer status showing current git project + branch |
| `subagent` | Run Pi subagents as tools with portable bundled definitions and per-user overrides |
| `terminal-notify` | Send a native desktop alert when Pi is ready for input |
| `web-fetch` | Fetch a URL and extract readable content as markdown |
| `web-search` | Search the web via Serper (Google results) |

## Skills

| Skill | Purpose |
|---|---|
| `pdf-reader` | Read and comprehend PDFs using hybrid text + vision strategy |
| `session-digest` | Extract and save important session exchanges to markdown |
| `todo` | Manage a project todo list |
| `ui-edit` | Reliable HTML/CSS/JS editing workflow |

## Requirements

- Pi coding agent `0.83.0` or newer.
- Node.js with TypeScript type stripping support for development and local-path installs.

## Install

> **Migration note:** `pi install` does not replace extensions manually copied into `~/.pi/agent/extensions/`. Remove or back up old manual copies before installing this package to avoid duplicate tool/flag conflicts. Keep any local config you still need, such as `web-search/auth.json`.

### From GitHub

```bash
pi install git:git@github.com:thomasdhc/pi-extensio
```

If SSH is not configured on the machine, HTTPS works too:

```bash
pi install git:https://github.com/thomasdhc/pi-extensio.git
```

Pull future package updates with:

```bash
pi update --extensions
```

Run `/reload` in an existing Pi session after installing or updating.

### From a local checkout

```bash
git clone git@github.com:thomasdhc/pi-extensio.git
cd pi-extensio
npm install
pi install .
```

A local-path installation loads changes directly from the checkout; run `/reload` after editing. Run `npm install` in the checkout before loading the package.

## Setup

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

### `pdf-reader` Python venv

```bash
cd skills/pdf-reader
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### `subagent` agent definitions

Portable default definitions are tracked in `agents/`. Package-local active defaults are tracked in `.pi/agents/` and override the portable defaults for every workspace that loads this package:

| Agent | Portable model | Package-local model | Thinking |
|---|---|---|---|
| `scout` | `openai-codex/gpt-5.6-sol` | `openai-codex/gpt-5.5` | medium |
| `researcher` | `openai-codex/gpt-5.6-sol` | `openai-codex/gpt-5.5` | medium |
| `reviewer` | `openai-codex/gpt-5.6-sol` | `openai-codex/gpt-5.5` | medium |
| `worker` | `openai-codex/gpt-5.6-sol` | `openai-codex/gpt-5.5` | medium |

Package-local overrides in `.pi/agents/` replace the portable bundled definitions in `agents/` for every workspace that loads this package. Create a definition with the same frontmatter `name` in `~/.pi/agent/agents/` to override bundled agents outside this package policy. Agent directories are merged in order: bundled `agents/`, user-global `~/.pi/agent/agents/`, then package-local `.pi/agents/`. Later definitions replace the complete earlier definition, including prompt, tools, model, and thinking level. Remove the later definition to return to the previous one. User-only and package-only agent names are also loaded.

### Terminal notifications

`terminal-notify` detects the current terminal at runtime, so the same package works across workstations:

| Terminal | Detection | Protocol |
|---|---|---|
| iTerm2 | `TERM_PROGRAM=iTerm.app` | OSC 9 |
| Tilix | `TILIX_ID` | OSC 777 |
| Kitty | `KITTY_WINDOW_ID` or `TERM=xterm-kitty` | OSC 99 |
| Ghostty / WezTerm | terminal-specific environment | OSC 777 |

Unknown terminals quietly receive no notification. Override detection when needed with `PI_TERMINAL_NOTIFY=iterm`, `kitty`, `tilix`, or `osc777`; disable alerts with `PI_TERMINAL_NOTIFY=off`.

When `bash-guard` opens an approval prompt, it also requests an urgent native notification and rings the terminal bell. In iTerm2, enable **Profiles → Terminal → Show bell icon in tabs** so the exact Pi tab is marked while iTerm2 is in the foreground.

Remove any older manually installed notification extension from `~/.pi/agent/extensions/` before reloading Pi to avoid duplicate alerts. iTerm2 notification permissions and the Linux desktop notification service must also allow notifications. Some Tilix builds lack the downstream OSC 777 notification patch; forcing `tilix` cannot add support when the terminal itself does not implement it.

## Development

Requires a Node.js version that supports type stripping.

```bash
npm install
npm test
```

Pi loads extensions from `extensions/` and skills from `skills/` via the package manifest.
