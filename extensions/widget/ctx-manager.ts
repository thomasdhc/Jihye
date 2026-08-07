/**
 * ctx-manager — context usage tracking + auto-compaction
 *
 * Publishes current context % and token count for companion widgets.
 * Warn at WARN_THRESHOLD, auto-compact at COMPACT_THRESHOLD
 *
 * Commands:
 *   /ctx  — show current usage as a notification
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { updateCompanionWidget } from "./api.ts";
import { CONTEXT_STATUS_EVENT, createContextStatusPayload } from "./context-status.ts";

const WARN_THRESHOLD    = 0.50;   // 50%  -- yellow warning notification
const COMPACT_THRESHOLD = 0.65;   // 65%  -- auto-compact silently

function publishStatus(pi: ExtensionAPI, ctx: ExtensionContext) {
  const usage = ctx.getContextUsage();
  if (!usage) return;

  const payload = createContextStatusPayload(usage);
  ctx.ui.setStatus("ctx-manager", undefined);
  pi.events.emit(CONTEXT_STATUS_EVENT, payload);
  updateCompanionWidget(pi.events, {
    id: "ctx-manager",
    region: "details",
    order: 10,
    lines: [payload.label],
    tone: "text",
  });
}

export default function (pi: ExtensionAPI) {

  // Publish context usage after every agent turn
  pi.on("agent_end", async (_event, ctx) => {
    const usage = ctx.getContextUsage();
    if (!usage) return;

    publishStatus(pi, ctx);

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

  // Also publish on session restore so companion widgets can populate immediately
  pi.on("session_start", async (_event, ctx) => {
    publishStatus(pi, ctx);
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
