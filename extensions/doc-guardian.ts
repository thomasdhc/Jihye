/**
 * doc-guardian — keeps loaded context files lean, clean, and current
 *
 * - Uses Pi's authoritative loaded context-file set
 * - Uses generous size thresholds and warns once when a file is unusually large
 * - Periodically offers a lightweight review reminder
 * - Status bar shows health at a glance
 *
 * Commands:
 *   /review-docs          — ask the agent to audit loaded context files now
 *   /doc-status           — show file stats without triggering a review
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as os from "node:os";
import * as path from "node:path";

// -- Policy -------------------------------------------------------------------

export const DOC_GUARDIAN_POLICY = {
	cautionLines: 150,
	warningLines: 250,
	reviewEvery: 50,
} as const;

// -- State --------------------------------------------------------------------

interface State {
	turnsSinceReview: number;
}

export interface DocGuardianOptions {
	home?: string;
}

export interface ContextFile {
	path: string;
	content: string;
}

export type DocHealth = "healthy" | "caution" | "warning";

export interface FileStats {
	path: string;
	label: string;
	lines: number;
	health: DocHealth;
}

// -- Checks -------------------------------------------------------------------

export function normalizeContextFiles(files: readonly ContextFile[] | undefined): ContextFile[] {
	const normalized: ContextFile[] = [];
	const seen = new Set<string>();
	for (const file of files ?? []) {
		if (seen.has(file.path)) continue;
		seen.add(file.path);
		normalized.push(file);
	}
	return normalized;
}

export function countLines(content: string): number {
	if (content.length === 0) return 0;
	const lines = content.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines.length;
}

export function classifyLineCount(lines: number): DocHealth {
	if (lines > DOC_GUARDIAN_POLICY.warningLines) return "warning";
	if (lines > DOC_GUARDIAN_POLICY.cautionLines) return "caution";
	return "healthy";
}

export function shouldRemind(turnsSinceReview: number): boolean {
	return turnsSinceReview > 0 && turnsSinceReview % DOC_GUARDIAN_POLICY.reviewEvery === 0;
}

function displayPath(file: string, home: string): string {
	const relative = path.relative(home, file);
	if (relative === "") return "~";
	if (!relative.startsWith("..") && !path.isAbsolute(relative)) return `~/${relative}`;
	return file;
}

export function statFiles(files: readonly ContextFile[], home = os.homedir()): FileStats[] {
	return files.map((file) => {
		const lines = countLines(file.content);
		return {
			path: file.path,
			label: displayPath(file.path, home),
			lines,
			health: classifyLineCount(lines),
		};
	});
}

export function statusIcon(stats: FileStats[]): string {
	if (stats.some((item) => item.health === "warning")) return "docs ●";
	if (stats.some((item) => item.health === "caution")) return "docs ◑";
	return "docs ○";
}

// -- Extension ----------------------------------------------------------------

export function createDocGuardianExtension(options: DocGuardianOptions = {}) {
	const home = options.home ?? os.homedir();

	return function docGuardian(pi: ExtensionAPI): void {
		let state: State = { turnsSinceReview: 0 };
		let contextFiles: ContextFile[] = [];
		let warnedFiles = new Set<string>();

		pi.on("session_start", async (_event, ctx) => {
			for (const entry of ctx.sessionManager.getEntries()) {
				if (entry.type === "custom" && (entry as any).customType === "doc-guardian") {
					state = (entry as any).data as State;
				}
			}
			contextFiles = [];
			warnedFiles = new Set<string>();
			ctx.ui.setStatus("doc-guardian", undefined);
		});

		// Capture exactly the context files Pi loaded for this request.
		pi.on("before_agent_start", (event, ctx) => {
			contextFiles = normalizeContextFiles(event.systemPromptOptions.contextFiles);
			refreshStatus(contextFiles, ctx.ui);
		});

		// Count settled requests rather than low-level retries or continuations.
		pi.on("agent_settled", async (_event, ctx) => {
			state.turnsSinceReview++;
			pi.appendEntry("doc-guardian", state);

			const stats = statFiles(contextFiles, home);
			refreshStatus(contextFiles, ctx.ui);

			// Warn once per warning episode instead of repeating after every request.
			const currentWarnings = new Set<string>();
			for (const item of stats) {
				if (item.health !== "warning") continue;
				currentWarnings.add(item.path);
				if (!warnedFiles.has(item.path)) {
					ctx.ui.notify(`${item.label} is ${item.lines} lines — consider /review-docs`, "warning");
				}
			}
			warnedFiles = currentWarnings;

			// Remind only at the interval, not after every subsequent request.
			if (shouldRemind(state.turnsSinceReview)) {
				ctx.ui.notify(
					`${state.turnsSinceReview} requests since the last doc review — consider /review-docs`,
					"info",
				);
			}
		});

		pi.registerCommand("review-docs", {
			description: "Audit context files for concrete staleness, duplication, and accuracy issues",
			handler: async (_args, ctx) => {
				await ctx.waitForIdle();

				state.turnsSinceReview = 0;
				pi.appendEntry("doc-guardian", state);

				contextFiles = normalizeContextFiles(ctx.getSystemPromptOptions().contextFiles);
				if (contextFiles.length === 0) {
					ctx.ui.notify("No context files loaded", "info");
					return;
				}
				const fileList = contextFiles.map((file) => displayPath(file.path, home)).join("\n  ");

				pi.sendUserMessage(
					`Please audit our context/instruction files for quality. The files to review are:\n  ${fileList}\n\n` +
					`For each file, check:\n` +
					`1. **Staleness** — references to files, commands, or patterns that no longer exist or have changed\n` +
					`2. **Focus** — sections whose maintenance or context cost clearly exceeds their practical value; length alone is not a defect\n` +
					`3. **Redundancy** — information duplicated across files or already covered by more-specific guidance\n` +
					`4. **Missing** — durable decisions, patterns, or conventions from this session that would prevent future mistakes\n` +
					`5. **Accuracy** — anything that describes how things work but is now wrong\n\n` +
					`Be conservative: preserve useful operational detail and guardrails, do not enforce a universal line limit, ` +
					`and report no finding when a file is already useful and accurate. For genuine issues, cite specific lines ` +
					`and suggest concrete edits. Don't make changes yet — just report.`,
					{ deliverAs: "followUp" },
				);
			},
		});

		pi.registerCommand("doc-status", {
			description: "Show loaded context file stats (lines, health)",
			handler: async (_args, ctx) => {
				contextFiles = normalizeContextFiles(ctx.getSystemPromptOptions().contextFiles);
				if (contextFiles.length === 0) {
					ctx.ui.notify("No context files loaded", "info");
					return;
				}

				const stats = statFiles(contextFiles, home);
				const lines = stats.map((item) => {
					const icon = item.health === "warning" ? "●" : item.health === "healthy" ? "○" : "◑";
					return `${icon} ${item.label}  (${item.lines} lines)`;
				});
				lines.push(`Requests since last review: ${state.turnsSinceReview}`);
				ctx.ui.notify(lines.join("\n"), "info");
			},
		});

		function refreshStatus(files: ContextFile[], ui: any): void {
			if (files.length === 0) {
				ui.setStatus("doc-guardian", undefined);
				return;
			}
			ui.setStatus("doc-guardian", statusIcon(statFiles(files, home)));
		}
	};
}

export default createDocGuardianExtension();
