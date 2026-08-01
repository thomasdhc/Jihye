# Pi Extensio

A personal, installable collection of extensions and skills for the [Pi coding agent](https://pi.dev).

## Extensions

| Extension | Purpose |
|---|---|
| `bash-guard` | Interactive prompt for destructive bash commands; headless hard-block in subagents |
| `ctx-manager` | Context usage status bar + auto-compaction at 65% |
| `custom-header` | Custom Pi startup header |
| `doc-guardian` | Watches `AGENTS.md` / `CLAUDE.md` for bloat and reminds you to review docs |
| `project-info` | Footer status showing current git project + branch |
| `subagent` | Run Pi subagents as tools; supports agent definitions in `~/.pi/agent/agents/` |
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

Agent definition files live outside this repo in `~/.pi/agent/agents/`.

## Development

Requires a Node.js version that supports type stripping.

```bash
npm install
npm test
```

Pi loads extensions from `extensions/` and skills from `skills/` via the package manifest.
