# Environment Composition

Jihye is the shared, portable baseline of an agent environment. Each machine selects optional environment packages alongside Jihye through Pi's native declarations in its global settings (`~/.pi/agent/settings.json` by default).

## Ownership

| Layer | Owns |
|---|---|
| **Jihye** | Reusable extensions, workflows, behavioral policy, defaults, and portable examples. |
| **Environment package** | Integrations, environment-specific workflows, references, and setup instructions. Company-specific content belongs in a separate private package. |
| **Workstation configuration** | Package selections, local paths, preferences, and connection configuration. Workspace-owned `REPO.md` and `USERNAME.md` retain local facts. |
| **Authentication storage** | Credentials stored outside source control. |

Environment packages use public Pi/Jihye contracts. Jihye remains independently usable, and public examples and tests stay generic.

## Configuration

Each machine maintains its own Pi configuration and primary workspace. Its global `packages` array contains Jihye and the attachments needed on that machine. Global declarations apply to every session using that configuration, independently of working directory and project trust.

The [declaration example](../../examples/composition/settings.example.json) shows Jihye plus an optional attachment. Replace its source markers manually with actual local, git, or npm sources before merging the package entries into existing settings. Preserve the installed Jihye declaration, other packages, and preferences.

Relative local sources resolve from the directory containing the settings file. Prepare local checkouts and their dependencies according to each package's instructions. Each machine manages its sources and versions independently.

Start Pi at the workspace root and configure the [persona guidance chain](../../README.md#configure-persona) separately. Connections, authentication, and extension-specific settings follow their documented setup and precedence.

## Attachment Lifecycle

1. Review the environment package's code and prepare it according to its instructions. Global extensions run with the Pi process's permissions.
2. Add its source alongside Jihye in the existing global `packages` array.
3. Complete connection and authentication setup, then run `/reload` in an existing session or start a new session.

To replace or remove an attachment, change only its package entry and reload each affected session. Keep Jihye and other entries unchanged. Updates to a shared local checkout become visible to its sessions on resource reload.

Environment packages document supported host versions, resource names, configuration locations, and connection or authentication setup. They declare their dependencies, use distinct package identities and resource names, and release live processes or connections through the host's shutdown lifecycle.

## Validation

`tests/environment-composition.test.ts` substitutes relative fixture sources for the example markers and exercises Pi's native package resolution. It covers:

- Core-only resolution and user-scoped loading of Jihye plus an attachment.
- Independent machine settings and global loading across working directories and project-trust decisions.
- Attachment replacement and removal through settings reload, preserving the core and another machine's configuration.

Fixtures use isolated temporary roots. Live integration behavior and extension shutdown require separate validation.
