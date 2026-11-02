# Environment Composition

Jihye is the shared, portable baseline of an agent environment. Install it globally once on each machine, then add optional environment packages to that machine's global Pi settings.

Each machine has its own Pi configuration and primary workspace. A machine that needs an environment package enables it alongside Jihye; another machine can keep Jihye without that attachment. Composition uses Pi's native package declarations, not separate work/personal installations, profile directories, a prescribed checkout layout, or a custom loader.

## Ownership

| Layer | Owns |
|---|---|
| **Jihye** | Universal extensions, workflows, behavioral policy, generic defaults, and portable configuration examples. |
| **Environment package** | Optional integrations, environment-specific workflows, reference documents, and documented defaults. Maintain company-specific content in a separate private package. |
| **Workstation configuration** | Package selections, local paths, personal overrides, and connection configuration. Workspace-owned `REPO.md` and `USERNAME.md` retain local facts. |
| **Authentication storage** | Credentials managed separately from source control, including private repositories. |

The dependency is one-way: an environment package uses public Pi/Jihye contracts; Jihye must remain usable without that package. Keep private services, organization-specific identifiers, and workstation paths out of public examples and tests.

## Per-Machine Global Configuration

The package list lives in the machine's global Pi settings, `~/.pi/agent/settings.json` by default. Keep the existing Jihye declaration and add the environment package to the same `packages` array. Preserve other package entries and preferences.

The [declaration example](../../examples/composition/settings.example.json) shows Jihye plus an optional environment package. Omit the environment entry on machines that do not need it. These are package choices in one settings file, not separate modes or configurations to switch between on the same machine.

Replace `<jihye-package-source>` and `<environment-package-source>` with actual local, git, or npm package sources before using the example. Pi does not expand these markers or load the example file automatically. Use existing checkouts or supported installation sources; no new directory arrangement is required.

Relative local sources resolve from the directory containing the global settings file, not from the process's working directory. Local-path loading does not copy packages or install their dependencies; prepare each checkout according to its installation instructions.

Use distinct package identities for Jihye and its attachments. The environment package adds resources without replacing the core. Existing global packages and independently configured resources remain active; this is additive composition, not an allowlist or isolated environment.

## Configuration and Workspace Boundary

Start Pi at the machine's workspace root and keep the existing [persona guidance chain](../../README.md#configure-persona). Repository operations can target checkouts within the workspace without changing its organization.

The global package list applies to every session using that Pi configuration, regardless of the working directory. Machine-specific settings provide the selection boundary; workspace-local `.pi/settings.json` declarations and project trust are not required to load these global packages.

Review package code before enabling it. Global extensions run with the Pi process's permissions; package selection is not a security boundary. Declaring a package does not create connections, obtain credentials, or install `AGENTS.md` context files. Guidance links and workspace-owned local facts remain independently configured.

## Attach, Replace, or Remove an Environment

1. Keep Jihye installed globally and prepare the separate environment package according to its own instructions.
2. Inspect `~/.pi/agent/settings.json`, then add the package source to its existing `packages` array. Replace the example markers before merging them; do not overwrite existing settings.
3. Complete the package's documented connection or authentication setup, then run `/reload` in an existing Pi session or start a new session.
4. To replace or remove an attachment, change only its entry in the global package list and reload each affected session. Leave the Jihye declaration and other package entries unchanged.

No Jihye source edit is required to change an attachment. An environment package must document its supported host versions, resource names, configuration locations, and connection or authentication setup. Prefer distinct resource names to avoid unintended collisions, and do not import undeclared dependencies or Jihye's private implementation modules.

Extension-specific configuration retains its existing locations and precedence. Changing the package list does not automatically relocate an extension's settings or credentials. Attachments with live processes or connections must release them through the host's shutdown lifecycle when reloaded.

Each machine manages its own package sources and versions. Updating a shared local checkout is visible to sessions using it on resource reload; this design does not synchronize configurations or installations across machines.

## Validation Boundary

`tests/environment-composition.test.ts` replaces the example source markers with relative paths to isolated fixture packages, then resolves them through Pi's native package manager. This substitution belongs only to the tests; it is not a runtime template system. The tests verify:

- The example declares the core and optional attachment without machine-specific sources.
- A core-only machine resolves Jihye without an environment package installed.
- A machine with an attachment resolves both packages once as user-scoped resources.
- Independent machine configurations choose different package sets; global loading does not depend on the session's working directory or project trust.
- Replacing environment A with B, then removing B and reloading global settings, preserves the core and leaves another machine's configuration unchanged.

These tests exercise package resolution, not live private integrations or extension-runtime cleanup. They do not change active workstation configuration.
