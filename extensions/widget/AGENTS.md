# Companion Widget

## Intent

The `widget` extension is one configurable companion surface, not a collection of independently loaded Pi extensions. Pi owns the top-level enable/disable switch; `/widget` controls the components inside it.

Keep the host generic. Components should own their state and behavior without knowing how the complete widget is laid out or which other components are enabled.

## Architecture

- `index.ts` is the sole Pi extension entrypoint. It loads configuration, registers the host and `/widget` interface, and conditionally registers components.
- `api.ts` defines the contribution event contract shared by the host and component producers.
- The host owns `ctx.ui.setWidget`, contribution composition, ordering, alignment, and rendering.
- Each component owns one contribution and publishes or removes it through the shared event API. Components must not call `setWidget` or depend on another component's state.
- `config.ts` owns validation and persistence. Configuration is global to Pi's agent directory, strict about unknown values, and defaults omitted components to enabled.
- `settings.ts` owns the `/widget` command and interactive settings UI. Persist changes before reloading extensions, and treat `await ctx.reload()` as terminal.
- `session-identity/` may maintain process-wide state and leases, so disabling it must clear active state and release its lease during reload.

## Invariants

- Disabling the top-level `widget` extension disables the host and every bundled component.
- Disabling one component must not disable, clear, or couple the remaining components.
- Component modules remain internal implementation details; do not make them separately discoverable extension entrypoints.
- Components must remove their contribution and clean up timers, listeners, leases, or process-wide state during shutdown.
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
