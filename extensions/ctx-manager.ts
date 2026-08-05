/**
 * ctx-manager — context usage tracking + auto-compaction
 *
 * Status bar: always shows current context % and token count
 * Warn at WARN_THRESHOLD, auto-compact at COMPACT_THRESHOLD
 *
 * Commands:
 *   /ctx  — show current usage as a notification
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WARN_THRESHOLD    = 0.50;   // 50%  -- yellow warning notification
const COMPACT_THRESHOLD = 0.65;   // 65%  -- auto-compact silently
const BAR_WIDTH         = 10;

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function contextBar(pct: number) {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.round(clamped * BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function updateStatus(ctx: ExtensionContext) {
  const usage = ctx.getContextUsage();
  if (!usage) return;

  const pct = usage.tokens / usage.contextWindow;
  const bar = contextBar(pct);
  const label = `ctx [${bar}] ${Math.round(pct * 100)}% (${fmt(usage.tokens)}/${fmt(usage.contextWindow)})`;
  ctx.ui.setStatus("ctx-manager", label);
}

export default function (pi: ExtensionAPI) {

  // Update status bar after every agent turn
  pi.on("agent_end", async (_event, ctx) => {
    const usage = ctx.getContextUsage();
    if (!usage) return;

    updateStatus(ctx);

    const pct = usage.tokens / usage.contextWindow;

    if (pct >= COMPACT_THRESHOLD) {
      ctx.ui.notify(
        `Context at ${Math.round(pct * 100)}% — auto-compacting...`,
        "warning",
      );
      ctx.compact({
        onComplete: () => ctx.ui.notify("Context compacted ✓", "success"),
        onError: (err) => ctx.ui.notify(`Compaction failed: ${err.message}`, "error"),
      });
    } else if (pct >= WARN_THRESHOLD) {
      ctx.ui.notify(
        `Context at ${Math.round(pct * 100)}% — run /compact to save tokens`,
        "warning",
      );
    }
  });

  // Also update on session restore so status bar is populated immediately
  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });

  // /ctx — quick usage readout
  pi.registerCommand("ctx", {
    description: "Show current context token usage",
    handler: async (_args, ctx) => {
      const usage = ctx.getContextUsage();
      if (!usage) {
        ctx.ui.notify("Context usage unavailable", "info");
        return;
      }
      const pct = Math.round((usage.tokens / usage.contextWindow) * 100);
      ctx.ui.notify(
        `Context: ${pct}%  —  ${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens`,
        "info",
      );
    },
  });
}
