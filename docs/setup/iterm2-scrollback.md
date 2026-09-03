# Bound Pi Scrollback in iTerm2

## Problem

Pi's regular TUI writes redraws into terminal-owned scrollback. During a long session, unlimited iTerm2 scrollback can accumulate repeated output and begin to lag.

Bound iTerm2's native scrollback so terminal memory and redraw history cannot grow indefinitely. Keep Pi in regular TUI mode for the most compatible extension dialogs and native terminal scrolling.

## Configure Pi

Regular mode is Pi's default. If fullscreen mode was previously enabled, merge this key into `~/.pi/agent/settings.json` without replacing its other settings:

```json
{
  "tuiMode": "regular"
}
```

Remove an obsolete `fullscreenExitOutput` entry if present; it has no effect in regular mode. The setting applies to both new and resumed sessions.

## Configure iTerm2

In **iTerm2 → Settings → Profiles → Terminal**, configure every profile used with Pi:

- Disable **Unlimited scrollback**.
- Set **Scrollback lines** to `10000`.

Open a new iTerm2 tab after changing the profile. Existing tabs may retain their previous session settings.

## Apply the Change to an Active Session

1. Change **TUI mode** to `regular` in Pi's `/settings`, if necessary.
2. Press **Command-K** in iTerm2 if the tab already contains excessive scrollback.
3. Open a new iTerm2 tab so the profile's bounded scrollback setting takes effect.
4. Run `pi -c` in the new tab to resume the conversation.

## Fullscreen Trade-offs

Fullscreen mode keeps Pi's transcript out of native scrollback and provides a sticky editor, transcript search, and Pi-managed scrolling. It remains experimental and constrains all content to the visible terminal viewport. Extension dialogs must implement their own height-aware layout and scrolling or long content can be clipped.

Use fullscreen mode per invocation when those benefits outweigh native terminal behavior:

```bash
pi --tui-mode fullscreen
```

Do not make it the default solely to control iTerm2 memory; the native scrollback cap already provides that bound.

## Configure Another Workstation

Cap scrollback in every iTerm2 profile used with Pi. Pi needs no workstation-specific change when it already uses the default regular mode.

iTerm2 can load preferences from a shared folder, but that synchronizes broader application preferences. Configuring the scrollback limit per profile on each device avoids coupling unrelated settings.
