import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

import { CONTEXT_STATUS_EVENT, type ContextStatusPayload } from "../lib/context-status.ts";
import { DOC_GUARDIAN_STATUS_EVENT, type DocGuardianStatusPayload } from "./doc-guardian.ts";

export type PiPetState = "idle" | "thinking" | "working" | "success" | "error";

export interface PiPetRuntimeState {
	visible: boolean;
	state: PiPetState;
	message: string;
	activeTools: number;
	sawError: boolean;
	contextStatus?: string;
	docStatus?: string;
}

const WIDGET_ID = "pi-pet";
const RESET_TO_IDLE_MS = 1500;
const PET_COLUMN_WIDTH = 10;

const STATE_MESSAGES: Record<PiPetState, string> = {
	idle: "ready when you are",
	thinking: "thinking with pi",
	working: "checking the workbench",
	success: "nice work",
	error: "something needs attention",
};

const PET_FRAMES: Record<PiPetState, string[]> = {
	idle: [" /\\_/\\", "( o.o )", " > ^ <"],
	thinking: [" /\\_/\\", "( -.- )", " > ? <"],
	working: [" /\\_/\\", "( o.o )", " /|_|\\"],
	success: [" /\\_/\\", "( ^.^ )", " > ★ <"],
	error: [" /\\_/\\", "( x.x )", " > ! <"],
};

export function createPiPetRuntimeState(): PiPetRuntimeState {
	return {
		visible: true,
		state: "idle",
		message: STATE_MESSAGES.idle,
		activeTools: 0,
		sawError: false,
	};
}

export function normalizePetState(value: string): PiPetState | undefined {
	const normalized = value.trim().toLowerCase();
	return (["idle", "thinking", "working", "success", "error"] as const).find((state) => state === normalized);
}

export function setPiPetState(runtime: PiPetRuntimeState, state: PiPetState, message = STATE_MESSAGES[state]): void {
	runtime.state = state;
	runtime.message = message;
}

export function renderPiPetLines(runtime: PiPetRuntimeState, style?: (state: PiPetState, text: string) => string): string[] {
	if (!runtime.visible) return [];

	const decorate = style ?? ((_state, text) => text);
	const frame = PET_FRAMES[runtime.state];
	const detailLines = [runtime.contextStatus, runtime.docStatus, runtime.message].filter((line): line is string => Boolean(line));
	return frame.map((line, index) => {
		const detail = detailLines[index];
		return decorate(runtime.state, detail ? `${line.padEnd(PET_COLUMN_WIDTH)}  ${detail}` : line);
	});
}

export function applyPiPetEvent(runtime: PiPetRuntimeState, event: string, payload?: { isError?: boolean }): PiPetState {
	switch (event) {
		case "session_start":
			runtime.activeTools = 0;
			runtime.sawError = false;
			setPiPetState(runtime, "idle");
			break;
		case "before_agent_start":
		case "agent_start":
			runtime.activeTools = 0;
			runtime.sawError = false;
			setPiPetState(runtime, "thinking");
			break;
		case "tool_execution_start":
			runtime.activeTools += 1;
			setPiPetState(runtime, "working");
			break;
		case "tool_execution_end":
			runtime.activeTools = Math.max(0, runtime.activeTools - 1);
			if (payload?.isError) {
				runtime.sawError = true;
				setPiPetState(runtime, "error");
			} else if (runtime.activeTools === 0 && !runtime.sawError) {
				setPiPetState(runtime, "thinking");
			}
			break;
		case "agent_settled":
			setPiPetState(runtime, runtime.sawError ? "error" : "success");
			runtime.activeTools = 0;
			break;
	}

	return runtime.state;
}

function renderWidget(ctx: ExtensionContext, runtime: PiPetRuntimeState): void {
	if (!ctx.hasUI) return;

	if (!runtime.visible) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(
		WIDGET_ID,
		(_tui, theme) => ({
			render(width: number) {
				const styled = renderPiPetLines(runtime, (state, text) => {
					if (state === "success") return theme.fg("success", text);
					if (state === "error") return theme.fg("error", text);
					if (state === "working") return theme.fg("warning", text);
					if (state === "thinking") return theme.fg("accent", text);
					return theme.fg("muted", text);
				});
				return styled.map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
		}),
		{ placement: "belowEditor" },
	);
}

export function createPiPetExtension(options: { resetToIdleMs?: number } = {}) {
	return function piPetExtension(pi: ExtensionAPI) {
		const runtime = createPiPetRuntimeState();
		const resetToIdleMs = options.resetToIdleMs ?? RESET_TO_IDLE_MS;
		let resetTimer: ReturnType<typeof setTimeout> | undefined;

		function clearResetTimer(): void {
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = undefined;
		}

		function update(ctx: ExtensionContext, state?: PiPetState, message?: string): void {
			clearResetTimer();
			if (state) setPiPetState(runtime, state, message);
			renderWidget(ctx, runtime);
		}

		function scheduleIdle(ctx: ExtensionContext): void {
			clearResetTimer();
			resetTimer = setTimeout(() => {
				setPiPetState(runtime, "idle");
				runtime.sawError = false;
				renderWidget(ctx, runtime);
			}, resetToIdleMs);
		}

		pi.events.on(CONTEXT_STATUS_EVENT, (payload: ContextStatusPayload) => {
			runtime.contextStatus = payload.label;
		});
		pi.events.on(DOC_GUARDIAN_STATUS_EVENT, (payload: DocGuardianStatusPayload) => {
			runtime.docStatus = payload.label;
		});

		pi.on("session_start", async (_event, ctx) => {
			applyPiPetEvent(runtime, "session_start");
			renderWidget(ctx, runtime);
		});

		pi.on("before_agent_start", async (_event, ctx) => {
			applyPiPetEvent(runtime, "before_agent_start");
			renderWidget(ctx, runtime);
		});

		pi.on("agent_start", async (_event, ctx) => {
			applyPiPetEvent(runtime, "agent_start");
			renderWidget(ctx, runtime);
		});

		pi.on("tool_execution_start", async (_event, ctx) => {
			applyPiPetEvent(runtime, "tool_execution_start");
			renderWidget(ctx, runtime);
		});

		pi.on("tool_execution_end", async (event, ctx) => {
			applyPiPetEvent(runtime, "tool_execution_end", { isError: Boolean((event as { isError?: boolean }).isError) });
			renderWidget(ctx, runtime);
		});

		pi.on("agent_settled", async (_event, ctx) => {
			applyPiPetEvent(runtime, "agent_settled");
			renderWidget(ctx, runtime);
			scheduleIdle(ctx);
		});

		pi.on("session_shutdown", async (_event, ctx) => {
			clearResetTimer();
			if (ctx.hasUI) {
				ctx.ui.setWidget(WIDGET_ID, undefined);
			}
		});

		pi.registerCommand("pet", {
			description: "Show and test the placeholder Pi pet",
			handler: async (args, ctx) => {
				const [command = "status", value] = args.trim().split(/\s+/, 2);

				switch (command.toLowerCase()) {
					case "show":
						runtime.visible = true;
						update(ctx);
						ctx.ui.notify("π-pet is visible", "info");
						return;
					case "hide":
						runtime.visible = false;
						update(ctx);
						ctx.ui.notify("π-pet is hidden", "info");
						return;
					case "react": {
						const nextState = value ? normalizePetState(value) : undefined;
						if (!nextState) {
							ctx.ui.notify("Usage: /pet react idle|thinking|working|success|error", "warning");
							return;
						}
						runtime.visible = true;
						update(ctx, nextState, `manual ${nextState}`);
						ctx.ui.notify(`π-pet reaction: ${nextState}`, "info");
						return;
					}
					case "test":
						runtime.visible = true;
						update(ctx, "success", "test sparkle");
						scheduleIdle(ctx);
						ctx.ui.notify("π-pet test reaction sent", "info");
						return;
					case "status":
						update(ctx);
						ctx.ui.notify(
							`π-pet is ${runtime.visible ? "visible" : "hidden"}; state=${runtime.state}; tools=${runtime.activeTools}`,
							"info",
						);
						return;
					case "help":
						ctx.ui.notify("/pet status | show | hide | test | react <state>", "info");
						return;
					default:
						ctx.ui.notify("Unknown /pet command. Try /pet help", "warning");
				}
			},
		});
	};
}

export default createPiPetExtension();
