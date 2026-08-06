import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
	type CompanionWidgetTone,
} from "../lib/companion-widget.ts";

export type PiPetState = "idle" | "thinking" | "working" | "success" | "error";

export interface PiPetRuntimeState {
	visible: boolean;
	state: PiPetState;
	message: string;
	activeTools: number;
	sawError: boolean;
}

const PET_ART_ID = "pi-pet:art";
const PET_STATUS_ID = "pi-pet:status";
const RESET_TO_IDLE_MS = 1500;

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

export function renderPiPetLines(runtime: PiPetRuntimeState): string[] {
	return runtime.visible ? PET_FRAMES[runtime.state] : [];
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

function toneForState(state: PiPetState): CompanionWidgetTone {
	if (state === "success") return "success";
	if (state === "error") return "error";
	if (state === "working") return "warning";
	if (state === "thinking") return "accent";
	return "muted";
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

		function publish(): void {
			if (!runtime.visible) {
				removeCompanionWidgetContribution(pi.events, PET_ART_ID);
				removeCompanionWidgetContribution(pi.events, PET_STATUS_ID);
				return;
			}

			const tone = toneForState(runtime.state);
			updateCompanionWidget(pi.events, {
				id: PET_ART_ID,
				region: "visual",
				order: 10,
				lines: renderPiPetLines(runtime),
				tone,
			});
			updateCompanionWidget(pi.events, {
				id: PET_STATUS_ID,
				region: "details",
				order: 30,
				lines: [runtime.message],
				tone,
			});
		}

		function update(state?: PiPetState, message?: string): void {
			clearResetTimer();
			if (state) setPiPetState(runtime, state, message);
			publish();
		}

		function scheduleIdle(): void {
			clearResetTimer();
			resetTimer = setTimeout(() => {
				setPiPetState(runtime, "idle");
				runtime.sawError = false;
				publish();
			}, resetToIdleMs);
		}

		pi.on("session_start", async () => {
			applyPiPetEvent(runtime, "session_start");
			publish();
		});

		pi.on("before_agent_start", async () => {
			applyPiPetEvent(runtime, "before_agent_start");
			publish();
		});

		pi.on("agent_start", async () => {
			applyPiPetEvent(runtime, "agent_start");
			publish();
		});

		pi.on("tool_execution_start", async () => {
			applyPiPetEvent(runtime, "tool_execution_start");
			publish();
		});

		pi.on("tool_execution_end", async (event) => {
			applyPiPetEvent(runtime, "tool_execution_end", { isError: Boolean((event as { isError?: boolean }).isError) });
			publish();
		});

		pi.on("agent_settled", async () => {
			applyPiPetEvent(runtime, "agent_settled");
			publish();
			scheduleIdle();
		});

		pi.on("session_shutdown", async () => {
			clearResetTimer();
			removeCompanionWidgetContribution(pi.events, PET_ART_ID);
			removeCompanionWidgetContribution(pi.events, PET_STATUS_ID);
		});

		pi.registerCommand("pet", {
			description: "Show and test the placeholder Pi pet",
			handler: async (args, ctx) => {
				const [command = "status", value] = args.trim().split(/\s+/, 2);

				switch (command.toLowerCase()) {
					case "show":
						runtime.visible = true;
						update();
						ctx.ui.notify("π-pet is visible", "info");
						return;
					case "hide":
						runtime.visible = false;
						update();
						ctx.ui.notify("π-pet is hidden", "info");
						return;
					case "react": {
						const nextState = value ? normalizePetState(value) : undefined;
						if (!nextState) {
							ctx.ui.notify("Usage: /pet react idle|thinking|working|success|error", "warning");
							return;
						}
						runtime.visible = true;
						update(nextState, `manual ${nextState}`);
						ctx.ui.notify(`π-pet reaction: ${nextState}`, "info");
						return;
					}
					case "test":
						runtime.visible = true;
						update("success", "test sparkle");
						scheduleIdle();
						ctx.ui.notify("π-pet test reaction sent", "info");
						return;
					case "status":
						update();
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
