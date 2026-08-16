# Companion Widget

## Intent

The `widget` extension is one configurable companion surface, not a collection of independently loaded Pi extensions. Pi owns the top-level enable/disable switch; `/widget` controls the components inside it.

Keep the host generic. Components should own their state and behavior without knowing how the complete widget is laid out or which other components are enabled.

## Blueprint Brief

`widget` composes isolated component producers behind one Pi-owned companion surface. The shared API is their only integration contract; the host owns layout and rendering, configuration owns persisted policy, and each component owns its state and contribution lifecycle.

- `index.ts` is the sole Pi extension entrypoint. It loads configuration, registers the host and `/widget` interface, and conditionally registers components.
- `api.ts` defines the contribution event contract shared by the host and component producers.
- The host owns `ctx.ui.setWidget`, contribution composition, ordering, alignment, and rendering.
- Each component owns its contribution namespace and publishes or removes only those contributions through the shared event API. Components must not call `setWidget` or depend on another component's state.
- `config.ts` owns validation and persistence. Configuration is global to Pi's agent directory, strict about unknown values, and defaults omitted components to enabled.
- `settings.ts` owns the `/widget` command and interactive settings UI. Persist changes before reloading extensions, and treat `await ctx.reload()` as terminal.
- `ctx-manager.ts` publishes context status as an isolated contribution through the shared API.
- `pi-pet/assets.ts` owns exact-width artwork and animation timing; `pi-pet/extension.ts` owns lifecycle state, timers, contribution publication, and the subscription to the subagent progress contract. It correlates progress only to active top-level subagent `toolCallId`s; parent `tool_execution_end` events remain authoritative for success and error.
- `session-identity/` may maintain process-wide state and leases, so disabling it must clear active state and release its lease during reload.

Canonical evidence: `index.ts`, `api.ts`, `config.ts`, `settings.ts`, `ctx-manager.ts`, `pi-pet/`, `session-identity/`, and `../../tests/widget/*.test.ts`.

## Invariants

- Disabling the top-level `widget` extension disables the host and every bundled component.
- Disabling one component must not disable, clear, or couple the remaining components.
- Component modules remain internal implementation details; do not make them separately discoverable extension entrypoints.
- Components must remove their contributions and clean up timers, listeners, leases, or process-wide state during shutdown.
- Pi-pet must ignore malformed, unknown, terminal, and late subagent progress IDs. Concurrent top-level calls keep independent animation state, and nested child agents remain activity of their top-level pet rather than creating new pets.
- Pi-pet artwork must already satisfy its configured display width; do not pad frames at runtime, and keep tests glyph-agnostic so manual artwork edits remain safe.
- Keep configuration sources separate from component logic. Inject policy callbacks when lifecycle behavior depends on persisted settings.
- Preserve default-enabled behavior when no `widget.json` exists or a component key is omitted. Invalid configuration should be reported rather than silently normalized.

## Adding a Component

1. Add its stable ID and default to `config.ts`.
2. Add its label and control to `settings.ts`.
3. Register it conditionally from `index.ts` while keeping the host component-agnostic.
4. Publish only its own contribution through `api.ts`, with an explicit region and order.
5. Implement shutdown cleanup and verify reload behavior when the component is turned off.
6. Add focused component tests, selective-loading coverage, and configuration parsing coverage.

Verify that Pi discovers only `extensions/widget/index.ts` as the widget extension entrypoint.
