# Bound Pi Scrollback in iTerm2

## Problem

Pi's regular TUI writes redraws into terminal-owned scrollback. During a long session, iTerm2 can accumulate repeated output and begin to lag.

Prevent this at both layers: keep Pi's transcript in its fullscreen viewport and cap iTerm2's native scrollback.

## Configure Pi

This configuration requires Pi `0.84.2` or newer. Merge these keys into `~/.pi/agent/settings.json` without replacing its other settings:

```json
{
  "tuiMode": "fullscreen",
  "fullscreenExitOutput": "resume-hint"
}
```

Fullscreen mode keeps the live transcript inside Pi's viewport. The `resume-hint` exit mode prevents Pi from printing the full transcript into native scrollback when it exits.

The settings apply to both startup commands:

- `pi` starts a new session in fullscreen mode.
- `pi -c` resumes the most recent session in fullscreen mode.

Use `pi -c` only when a previous session needs to be resumed; it is not required for the fullscreen setting.

## Configure iTerm2

In **iTerm2 → Settings → Profiles → Terminal**, configure every profile used with Pi:

- Disable **Unlimited scrollback**.
- Set **Scrollback lines** to `10000`.

Open a new iTerm2 tab after changing the profile. Existing tabs may retain their previous session settings.

## Apply the Change to an Active Session

1. Run `/quit` in Pi.
2. Press **Command-K** in iTerm2 if the tab already contains excessive scrollback.
3. Open a new tab and run `pi -c` to resume the conversation.

## Configure Another Workstation

Repeat both configurations on every workstation:

1. Merge the two Pi keys into that device's `~/.pi/agent/settings.json`.
2. Cap scrollback in every iTerm2 profile used with Pi.

Copy only the two Pi settings when devices have different providers, models, package paths, or other local configuration. iTerm2 can load preferences from a shared folder, but that synchronizes broader application preferences; configuring the scrollback limit per profile on each device avoids coupling unrelated settings.
