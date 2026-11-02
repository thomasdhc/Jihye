# Environment Composition

Jihye is the shared, portable core of an agent environment. Optional environment packages attach integrations and workflows without making Jihye depend on a particular organization or workstation.

Composition uses Pi's existing package declarations. It does not introduce a profile loader, template renderer, or configuration inheritance system.

## Ownership

| Layer | Owns |
|---|---|
| **Jihye** | Universal extensions, workflows, behavioral policy, generic defaults, and copyable configuration examples. |
| **Environment package** | Optional integrations, environment-specific workflows, reference documents, and documented defaults. Maintain company-specific content in a separate private package. |
| **Workstation configuration** | Package selections, local paths, personal overrides, and connection configuration. Workspace-owned `REPO.md` and `USERNAME.md` retain local facts. |
| **Authentication storage** | Credentials managed separately from source control, including private repositories. |

The dependency is one-way: an environment package uses public Pi/Jihye contracts; Jihye must remain usable without that package. Do not make public examples or tests depend on private services, identifiers, or workstation paths.

## Native Composition Contract

A Pi `settings.json` declares sources in its `packages` array. The examples use local package directories:

- [Public example](../../examples/profiles/public/settings.example.json): Jihye alone.
- [Work example](../../examples/profiles/work/settings.example.json): the same Jihye plus one optional environment package.

`public` and `work` are example labels, not built-in Pi modes or workspace persona profiles. Each settings file is independent; the work file does not inherit or import the public file. Both can reference the same Jihye checkout without copying its code or guidance.

Relative local package sources resolve from the directory containing `settings.json`, not from the process's working directory. These are literal paths, not variables or automatically expanded placeholders. Pi also supports other package source formats; follow the installed Pi version's package documentation when choosing them.

Packages contribute extensions, skills, prompt templates, and themes through their native package layout or `pi` manifest. Keep integration adapters and their configuration instructions with the environment package. Declaring a package does not itself create connections, obtain credentials, or install `AGENTS.md` context files.

Other resources independently configured in the agent directory or project still follow Pi's loading rules. These examples are package lists, not resource allowlists.

## Copyable Layout

The relative paths in both examples match this fictional layout:

```text
environment/
├── packages/
│   ├── jihye/
│   └── work-environment/     # optional, separately maintained package
└── profiles/
    ├── public/
    │   └── settings.json
    └── work/
        └── settings.json
```

The package directories are separate checkouts or prepared local packages. Local-path loading does not copy them or install their dependencies; prepare each according to its installation instructions.

This layout is illustrative, not required. Use your existing Pi configuration or choose separate agent directories. `PI_CODING_AGENT_DIR` selects an agent directory at startup; selecting another directory does not inherit settings or resources from the previous one.

To use an example:

1. Prepare Jihye and, if needed, an environment package outside the Jihye checkout.
2. Inspect the destination settings first. Merge the example's package entries into existing settings, or copy it as `settings.json` in a new agent directory. Do not overwrite existing preferences.
3. Edit the source paths for that settings directory. Pi does not load `settings.example.json` automatically or arrange the illustrated directories.
4. Configure the existing [persona guidance chain](../../README.md#configure-persona). If using a different agent directory, its global context link belongs there; workspace context and local facts stay workspace-owned.
5. Complete any additional setup documented by the environment package, then reload Pi resources. Start a new process when changing the agent directory itself.

Extension-specific configuration keeps its existing locations and precedence. These examples do not migrate overrides or make every extension profile-aware; consult the component's documentation before assuming a setting changes with the selected agent directory.

## Attach or Replace an Environment

Keep the Jihye package entry unchanged. Add or replace the environment package entry, complete that package's documented setup, and reload resources. No Jihye source edit is required to change the attachment.

An environment package must document its supported host versions, resource names, configuration locations, and any connection or authentication setup. Prefer distinct resource names to avoid unintended collisions, and do not import undeclared dependencies or Jihye's private implementation modules.

With a shared local Jihye checkout, a core update is visible to both configurations on resource reload. With separate installations, manage the selected core versions explicitly; there is no synchronization mechanism in these examples.

## Validation Boundary

`tests/environment-composition.test.ts` copies the example JSON verbatim into fictional workstation roots and resolves fixture packages through Pi's native package manager. It verifies:

- The public example declares only the shared core and resolves it without an environment package installed.
- The work example adds an environment without replacing the core.
- Both examples resolve from different roots without workstation-specific paths.
- Replacing environment A with B and reloading settings removes A's resources while keeping the core's resources.

These tests exercise package composition, not live private integrations or a new runtime subsystem. No active workstation configuration is changed by this document or its examples.
