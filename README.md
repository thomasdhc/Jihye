# Pi Extensio

A personal, installable collection of extensions for the [Pi coding agent](https://pi.dev).

*Extensio* is Latin for extension or expansion.

## Extensions

| Extension | Purpose |
|---|---|
| `bash-guard` | Requires manual approval before selected destructive filesystem commands run through the agent's Bash tool. |

### Bash guard scope

The guard currently covers a deliberately small set:

- `rm`
- `rmdir`
- `unlink`
- `find ... -delete`

It recognizes direct invocations and common forms involving `sudo`, `env`, `command`, `builtin`, `xargs`, and `find -exec`. If manual approval is unavailable, matching commands are blocked.

## Install

### From GitHub

```bash
pi install git:git@github.com:thomasdhc/pi-extensio
```

Pull future package updates with:

```bash
pi update --extensions
```

Run `/reload` in an existing Pi session after installing or updating.

### From a local checkout

```bash
git clone git@github.com:thomasdhc/pi-extensio.git ~/Workspace/repo/pi-extensio
pi install ~/Workspace/repo/pi-extensio
```

A local-path installation loads extension changes directly from the checkout; run `/reload` after editing.

## Development

Requires a Node.js version that supports type stripping.

```bash
npm test
```

Add standalone extension files under `extensions/`. The Pi package manifest discovers `extensions/*.ts` automatically.
