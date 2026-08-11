import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { TERMINAL_NOTIFY_EVENT, type TerminalNotificationRequest } from "../terminal-notify.ts";
import { analyzeBashCommand, analyzeGitHubCliCommand, analyzeGitLabCliCommand } from "./analysis.ts";
import { HEADLESS_BLOCKED } from "./policy.ts";
import { promptRunOrAbort } from "./prompt.ts";

export { analyzeBashCommand, analyzeGitHubCliCommand, analyzeGitLabCliCommand } from "./analysis.ts";
export type { Risk } from "./analysis.ts";
export type { Severity } from "./policy.ts";

// PI_SUBAGENT_DEPTH is 0 (or unset) in the main session and >= 1 in spawned subagent processes.
// Behaviour branches on this: interactive prompting in the main session, headless hard-block
// for catastrophic operations in subagents (where stdin is /dev/null and no UI is available).
const _subagentDepth = Number(process.env.PI_SUBAGENT_DEPTH ?? "0");
const _isSubagent = Number.isFinite(_subagentDepth) && _subagentDepth >= 1;

export default function (pi: ExtensionAPI) {
	if (_isSubagent) {
		// Subagent mode: hard-block catastrophic operations, no prompting.
		pi.on("tool_call", async (event) => {
			if (!isToolCallEventType("bash", event)) return;
			const command = event.input.command;
			for (const [platform, hostedCliRisk] of [
				["GitHub", analyzeGitHubCliCommand(command)],
				["GitLab", analyzeGitLabCliCommand(command)],
			] as const) {
				if (!hostedCliRisk) continue;
				return {
					block: true,
					reason:
						`Blocked by bash-guard: ${hostedCliRisk.reasons.join("; ")}. ` +
						`This is a non-interactive subagent session — dangerous ${platform} operations are not permitted. ` +
						"Ask the parent agent to perform the operation with user approval.",
				};
			}
			const publicationRisk = analyzeBashCommand(command);
			if (publicationRisk?.requiresInteractiveApproval) {
				return {
					block: true,
					reason:
						`Blocked by bash-guard: ${publicationRisk.reasons.join("; ")}. ` +
						"This is a non-interactive subagent session — publication operations require parent-session user approval. " +
						"Ask the parent agent to perform the operation.",
				};
			}
			for (const { pattern, reason } of HEADLESS_BLOCKED) {
				if (pattern.test(command)) {
					return {
						block: true,
						reason:
							`Blocked by bash-guard: ${reason}. ` +
							"This is a non-interactive subagent session — catastrophic operations are not permitted. " +
							"Propose a safer alternative or ask the parent agent to confirm with the user.",
					};
				}
			}
		});
		return;
	}

	// Main session mode: interactive prompting.
	pi.registerFlag("bash-guard-auto-allow", {
		description: "Allow standard guard risks without a UI; pushes and PR/MR creation still require interactive approval.",
		type: "boolean",
		default: false,
	});

	// Avoid annoying retry loops: if the exact command was aborted recently, auto-block it.
	const recentlyAborted = new Map<string, number>();
	const ABORT_REMEMBER_MS = 60_000;

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		const command = event.input.command;
		const risk = analyzeBashCommand(command);
		if (!risk) return;

		const now = Date.now();
		const lastAbort = recentlyAborted.get(command);
		if (lastAbort && now - lastAbort < ABORT_REMEMBER_MS) {
			return {
				block: true,
				reason:
					"Blocked by bash-guard: command was already aborted recently. Ask the user for a safer alternative; do not retry the same command.",
			};
		}

		if (
			!ctx.hasUI &&
			pi.getFlag("--bash-guard-auto-allow") &&
			!risk.requiresInteractiveApproval
		) {
			// Non-interactive mode: allow standard risks when explicitly requested.
			// Publication boundaries always require a fresh interactive decision.
			return;
		}

		if (ctx.hasUI && ctx.mode === "tui") {
			const request: TerminalNotificationRequest = {
				mode: ctx.mode,
				body: `Bash approval required (${risk.severity} risk)`,
				ringBell: true,
			};
			pi.events.emit(TERMINAL_NOTIFY_EVENT, request);
		}

		const choice = await promptRunOrAbort(ctx, command, risk);
		if (choice === "run") return;

		recentlyAborted.set(command, now);
		return {
			block: true,
			reason:
				"Blocked by user via bash-guard (guarded command). Ask the user for confirmation or propose a safe alternative.",
		};
	});
}
