/**
 * doc-guardian — keeps AGENTS.md and CLAUDE.md files lean, clean, and current
 *
 * - Scans context files at session start and every N turns
 * - Warns when a file exceeds the line threshold
 * - Reminds you to review after N turns of inactivity
 * - Status bar shows health at a glance
 *
 * Commands:
 *   /review-docs          — ask Claude to audit all context files now
 *   /doc-status           — show file stats without triggering a review
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// -- Config -------------------------------------------------------------------

const LINE_WARN    = 75;    // lines -- warn above this
const LINE_DANGER  = 120;   // lines -- stronger warning
const REVIEW_EVERY = 20;    // turns -- remind to /review-docs

// -- State --------------------------------------------------------------------

interface State {
  turnsSinceReview: number;
}

// -- File discovery -----------------------------------------------------------

function findContextFiles(cwd: string): string[] {
  const found: string[] = [];

  // Global AGENTS.md
  const global = path.join(os.homedir(), ".pi/agent/AGENTS.md");
  if (fs.existsSync(global)) found.push(global);

  // CLAUDE.md -- walk up from cwd to git root (or home)
  const home = os.homedir();
  let dir = cwd;
  while (dir.startsWith(home) && dir !== home) {
    const f = path.join(dir, "CLAUDE.md");
    if (fs.existsSync(f)) found.push(f);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return found;
}

// -- Checks -------------------------------------------------------------------

interface FileStats {
  path: string;
  label: string;
  lines: number;
  ok: boolean;
  danger: boolean;
}

function statFiles(files: string[]): FileStats[] {
  return files.map((f) => {
    const content = fs.readFileSync(f, "utf-8");
    const lines   = content.split("\n").length;
    const label   = f.replace(os.homedir(), "~");
    return {
      path:   f,
      label,
      lines,
      ok:     lines <= LINE_WARN,
      danger: lines > LINE_DANGER,
    };
  });
}

function statusIcon(stats: FileStats[]): string {
  if (stats.some((s) => s.danger))  return "docs ●";
  if (stats.some((s) => !s.ok))     return "docs ◑";
  return "docs ○";
}

// -- Extension ----------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let state: State = { turnsSinceReview: 0 };
  let cachedFiles:  string[] = [];

  // Restore state from session entries
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && (entry as any).customType === "doc-guardian") {
        state = (entry as any).data as State;
      }
    }
    cachedFiles = findContextFiles(ctx.cwd);
    refreshStatus(cachedFiles, ctx.ui);
  });

  // Check after every turn
  pi.on("agent_end", async (_event, ctx) => {
    state.turnsSinceReview++;
    pi.appendEntry("doc-guardian", state);

    cachedFiles = findContextFiles(ctx.cwd);
    const stats = statFiles(cachedFiles);
    refreshStatus(cachedFiles, ctx.ui);

    // Warn about bloated files
    for (const s of stats) {
      if (s.danger) {
        ctx.ui.notify(`${s.label} is ${s.lines} lines — run /review-docs`, "warning");
      }
    }

    // Periodic reminder
    if (state.turnsSinceReview >= REVIEW_EVERY) {
      ctx.ui.notify(
        `${state.turnsSinceReview} turns without a doc review — run /review-docs`,
        "info",
      );
    }
  });

  // /review-docs — ask Claude to audit the files
  pi.registerCommand("review-docs", {
    description: "Ask Claude to audit context files for staleness, bloat, and accuracy",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      state.turnsSinceReview = 0;
      pi.appendEntry("doc-guardian", state);

      cachedFiles = findContextFiles(ctx.cwd);
      const fileList = cachedFiles.map((f) => f.replace(os.homedir(), "~")).join("\n  ");

      pi.sendUserMessage(
        `Please audit our context/instruction files for quality. The files to review are:\n  ${fileList}\n\n` +
        `For each file, check:\n` +
        `1. **Staleness** — references to files, commands, or patterns that no longer exist or have changed\n` +
        `2. **Bloat** — verbose sections that could be trimmed or moved to docs/ and read on demand\n` +
        `3. **Redundancy** — information duplicated across files or already obvious from context\n` +
        `4. **Missing** — recent decisions, patterns, or conventions from this session not yet captured\n` +
        `5. **Accuracy** — anything that describes how things work but is now wrong\n\n` +
        `Read each file, report findings per file with specific line references, and suggest concrete edits. ` +
        `Don't make changes yet — just report.`,
        { deliverAs: "followUp" },
      );
    },
  });

  // /doc-status — quick stats, no LLM call
  pi.registerCommand("doc-status", {
    description: "Show context file stats (lines, health)",
    handler: async (_args, ctx) => {
      cachedFiles = findContextFiles(ctx.cwd);
      if (cachedFiles.length === 0) {
        ctx.ui.notify("No context files found", "info");
        return;
      }

      const stats = statFiles(cachedFiles);
      const lines = stats.map((s) => {
        const icon = s.danger ? "●" : s.ok ? "○" : "◑";
        return `${icon} ${s.label}  (${s.lines} lines)`;
      });
      lines.push(`Turns since last review: ${state.turnsSinceReview}`);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  function refreshStatus(files: string[], ui: any) {
    if (files.length === 0) return;
    const stats = statFiles(files);
    ui.setStatus("doc-guardian", statusIcon(stats));
  }
}
