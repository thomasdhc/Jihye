/**
 * Terminal rendering for subagent progress and results.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, visibleWidth } from "@earendil-works/pi-tui";

import type { AgentResult } from "./types.ts";

type Theme = ExtensionContext["ui"]["theme"];

export function getTermWidth(): number {
	return process.stdout.columns || 120;
}

// ── Formatting Utilities ──────────────────────────────────────────────

function formatTokens(n: number): string {
	return n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function formatContextUsage(tokens: number, contextWindow: number | undefined): string {
	if (!contextWindow) return `${formatTokens(tokens)} ctx`;
	const pct = (tokens / contextWindow) * 100;
	const maxStr = contextWindow >= 1_000_000 ? `${(contextWindow / 1_000_000).toFixed(1)}M` : `${Math.round(contextWindow / 1000)}k`;
	return `${pct.toFixed(1)}%/${maxStr}`;
}

function truncLine(text: string, maxWidth: number): string {
	if (text.includes("\n") || text.includes("\r")) {
		text = text.replace(/\r?\n/g, "↵ ");
	}
	if (visibleWidth(text) <= maxWidth) return text;
	let result = "";
	let width = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === "\x1b") {
			const match = text.slice(i).match(/^\x1b\[[0-9;]*m/);
			if (match) {
				result += match[0];
				i += match[0].length - 1;
				continue;
			}
		}
		if (width >= maxWidth - 1) {
			return result + "…";
		}
		result += ch;
		width++;
	}
	return result;
}

// ── Progress Rendering ────────────────────────────────────────────────

export function renderAgentProgress(
	r: AgentResult,
	theme: Theme,
	expanded: boolean,
	w: number,
	depth: number = 0,
): Container {
	const c = new Container();
	const prog = r.progress;
	const isRunning = prog.status === "running";
	const isPending = prog.status === "pending";
	const nested = depth > 0;

	const indent = nested ? "  ".repeat(depth) : "";
	const innerW = Math.max(20, w - indent.length);

	const addLine = (content: string) => {
		if (expanded) {
			c.addChild(new Text(indent + content, 0, 0));
		} else {
			c.addChild(new Text(indent + truncLine(content, innerW), 0, 0));
		}
	};

	const icon = isRunning
		? theme.fg("warning", "⟳")
		: isPending
			? theme.fg("dim", "○")
			: r.exitCode === 0
				? theme.fg("success", "✓")
				: theme.fg("error", "✗");
	const stats = `${prog.toolCount} tools · ${formatDuration(prog.durationMs)}`;
	const modelStr = r.model ? theme.fg("dim", ` (${r.model})`) : "";
	addLine(`${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${modelStr} — ${theme.fg("dim", stats)}`);

	const renderToolRow = (
		toolName: string,
		args: string,
		children: AgentResult[] | undefined,
		isCurrent: boolean,
	) => {
		const body = args ? `${toolName}: ${args}` : toolName;
		if (isCurrent) {
			addLine(theme.fg("warning", `▸ ${body}`));
		} else {
			addLine(theme.fg("muted", `  ${body}`));
		}
		if (children && children.length > 0) {
			for (const child of children) {
				c.addChild(renderAgentProgress(child, theme, expanded, w, depth + 1));
			}
		}
	};

	for (const t of prog.recentTools) {
		renderToolRow(t.tool, t.args, t.children, t.status === "running");
	}

	if (prog.lastMessage) {
		if (!nested) c.addChild(new Spacer(1));
		addLine(theme.fg("text", prog.lastMessage));
	}

	if (!nested && !isRunning && r.output && expanded) {
		c.addChild(new Spacer(1));
		const mdTheme = getMarkdownTheme();
		c.addChild(new Markdown(r.output, 0, 0, mdTheme));
	}

	if (!nested) c.addChild(new Spacer(1));
	const usageParts: string[] = [];
	if (r.usage.input) usageParts.push(theme.fg("dim", `↑${formatTokens(r.usage.input)}`));
	if (r.usage.output) usageParts.push(theme.fg("dim", `↓${formatTokens(r.usage.output)}`));
	if (r.usage.cacheRead) usageParts.push(theme.fg("dim", `R${formatTokens(r.usage.cacheRead)}`));
	if (r.usage.cacheWrite) usageParts.push(theme.fg("dim", `W${formatTokens(r.usage.cacheWrite)}`));
	if (r.usage.cost) usageParts.push(theme.fg("dim", `$${r.usage.cost.toFixed(3)}`));
	if (prog.tokens > 0) {
		const ctxStr = formatContextUsage(prog.tokens, r.contextWindow);
		const pct = r.contextWindow ? (prog.tokens / r.contextWindow) * 100 : 0;
		const coloredCtx = pct > 90 ? theme.fg("error", ctxStr) : pct > 70 ? theme.fg("warning", ctxStr) : theme.fg("dim", ctxStr);
		usageParts.push(coloredCtx);
	}
	if (usageParts.length) {
		addLine(usageParts.join(" "));
	}

	if (prog.error) {
		addLine(theme.fg("error", `Error: ${prog.error}`));
	}

	return c;
}
