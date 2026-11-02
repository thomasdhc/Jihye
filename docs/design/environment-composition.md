# Environment Composition

Jihye is the shared, portable baseline of an agent environment. Install it globally once, then add an optional environment package in each workspace that needs its integrations and workflows.

Composition uses Pi's native global and project package declarations. It does not require separate work/personal installations, profile directories, a new checkout layout, or a custom loader.

## Ownership

| Layer | Owns |
|---|---|
| **Jihye** | Universal extensions, workflows, behavioral policy, generic defaults, and portable configuration examples. |
| **Environment package** | Optional integrations, environment-specific workflows, reference documents, and documented defaults. Maintain company-specific content in a separate private package. |
| **Workstation configuration** | Package selections, local paths, personal overrides, and connection configuration. Workspace-owned `REPO.md` and `USERNAME.md` retain local facts. |
| **Authentication storage** | Credentials managed separately from source control, including private repositories. |

The dependency is one-way: an environment package uses public Pi/Jihye contracts; Jihye must remain usable without that package. Keep private services, organization-specific identifiers, and workstation paths out of public examples and tests.

## Global Baseline and Workspace Attachment

| Scope | Settings location | Package declaration |
|---|---|---|
| Global | `~/.pi/agent/settings.json` by default | Jihye and any other globally enabled packages. |
| Selected workspace | `.pi/settings.json` under the workspace root | Only the additional environment package. |

The [global example](../../examples/composition/global.settings.example.json) shows the baseline declaration. The [workspace example](../../examples/composition/workspace.settings.example.json) adds an environment package without repeating or replacing Jihye.

If Jihye is already installed globally, leave its declaration unchanged. Merge the attachment into the selected workspace's existing settings without removing its other package entries or preferences. A workspace without an attachment keeps the global baseline.

The example sources are explicit replace-before-use markers: replace `<jihye-package-source>` and `<environment-package-source>` with actual local, git, or npm package sources. Pi does not expand these markers or load the example files automatically. They prescribe no directory arrangement; use existing checkouts or the package's supported installation source.

Relative local sources resolve from the directory containing their settings file: the agent directory for global sources and the workspace's `.pi` directory for project sources. They do not resolve from the process's working directory. Local-path loading does not copy packages or install their dependencies; prepare each checkout according to its installation instructions.

Use a distinct package identity for the attachment. Declaring the same package identity in both scopes normally overrides the global declaration rather than adding a second instance; this design does not require a workspace-level Jihye override.

## Workspace Session Boundary

Start Pi at the selected workspace root. Repository operations can target checkouts within that workspace while the Pi session remains rooted there.

Pi reads project settings from the session's working directory. It does not inherit `.pi/settings.json` package declarations from parent directories. Starting Pi directly inside a nested repository is therefore outside this workspace-root loading contract.

Workspace package declarations load only after project trust is granted. Review the settings and package code before trusting them; without trust, the workspace attachment is skipped and the global baseline remains available. Trust controls loading, not the permissions of tools or extensions.

Packages contribute extensions, skills, prompt templates, and themes through their native package layout or `pi` manifest. Declaring a package does not itself create connections, obtain credentials, or install `AGENTS.md` context files. Keep the existing [persona guidance chain](../../README.md#configure-persona); workspace context and local facts remain workspace-owned.

Other globally enabled packages and independently configured resources remain active. The examples describe additive package composition, not resource allowlists or isolated environments.

## Attach, Replace, or Remove an Environment

1. Keep Jihye installed globally and prepare the separate environment package according to its own instructions.
2. Inspect the workspace-root `.pi/settings.json`, then add the package source to its `packages` array. Replace the example marker before merging it; do not overwrite existing settings.
3. Start Pi at that workspace root, review and grant project trust, and complete the package's documented connection or authentication setup.
4. After changing an attachment, run `/reload` in the workspace session. Replace or remove only the attachment's workspace declaration; leave the global Jihye declaration unchanged.

No Jihye source edit is required to change an attachment. An environment package must document its supported host versions, resource names, configuration locations, and connection or authentication setup. Prefer distinct resource names to avoid unintended collisions, and do not import undeclared dependencies or Jihye's private implementation modules.

Extension-specific configuration retains its existing locations and precedence. Workspace package selection does not automatically relocate an extension's settings or credentials. Attachments with live processes or connections must release them through the host's shutdown lifecycle when reloaded.

## Validation Boundary

`tests/environment-composition.test.ts` replaces the example source markers with relative paths to isolated fixture packages, then resolves them through Pi's native package manager. This substitution belongs only to the tests; it is not a runtime template system. The tests verify:

- The global example declares only the core; the workspace example declares only the attachment.
- One global baseline serves selected and unselected workspaces at two temporary roots.
- Trusted workspace resources add to user-scoped core resources without replacing them.
- The core resolves without an environment package installed, and an untrusted workspace does not load its attachment.
- Replacing environment A with B, then removing B and reloading settings, preserves the core and drops the old attachment's resources.

These tests exercise package resolution, not live private integrations or extension-runtime cleanup. They do not change active workstation configuration.
