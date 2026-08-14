# Jihye · 지혜 · 智慧

Jihye is an installable toolkit for shaping [Pi](https://pi.dev) around your workflow. It bundles focused extensions, reusable skills, portable agent definitions, and global/workspace guidance into one package that works consistently across workstations.

## Components

- [Extensions](extensions/README.md) — tools, commands, lifecycle integrations, terminal features, and their configuration.
- [Skills](skills/README.md) — reusable workflows that Pi loads on demand.
- [Personas](personas/README.md) — global and workspace guidance, local-configuration templates, and portable subagent definitions.

## Requirements

- Pi coding agent `0.83.0` or newer.
- Node.js with TypeScript type stripping support for development and local-path installs.
- GitHub CLI `2.82.1` or newer when creating or editing pull requests; earlier versions fail `gh pr edit` on deprecated Projects Classic APIs.

## Install

### From GitHub

```bash
pi install git:git@github.com:thomasdhc/Jihye
```

If SSH is not configured on the machine, HTTPS works too:

```bash
pi install git:https://github.com/thomasdhc/Jihye.git
```

Pull future package updates with:

```bash
pi update --extensions
```

Run `/reload` in an existing Pi session after installing or updating.

### From a local checkout

```bash
git clone git@github.com:thomasdhc/Jihye.git
cd Jihye
npm install
pi install .
```

A local-path installation loads changes directly from the checkout; run `/reload` after editing. Run `npm install` in the checkout before loading the package.

## Configure Guidance

Pi packages do not install context files automatically, so configure two symlinks after installing Jihye. The commands below expect both destinations not to exist; inspect and remove obsolete symlinks first, and never overwrite a regular context file.

```bash
JIHYE=/path/to/Jihye
WORKSPACE=/path/to/workspace

ln -s "$JIHYE/personas/JIHYE.md" ~/.pi/agent/AGENTS.md
ln -s "$JIHYE/personas/WORKSPACE.md" "$WORKSPACE/AGENTS.md"
```

The workspace root keeps machine-local `REPO.md` and `USERNAME.md` files. The `jihye-setup` extension resolves the package, personas, and workspace locations behind those symlinks, so guidance can reference sibling `GIT.md` policy without an agent deriving any path by hand.

Verify the chain with `/jihye-setup`: both guidance locations should report as managed and loaded, `workspace_profile` should read `standard` or `strict`, and the two local environment files should be listed. See the [personas guide](personas/README.md) for strict-profile setup and local-configuration templates.

## Development

Requires a Node.js version that supports type stripping.

```bash
npm install
npm test
```

Pi loads extensions from `extensions/` and skills from `skills/` through the package manifest. See the [extension guide](extensions/README.md) and [skill guide](skills/README.md) for component-specific setup and usage.
