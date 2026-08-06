import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
	type CompanionWidgetTone,
} from "../lib/companion-widget.ts";

export type PiPetState = "idle" | "thinking" | "working" | "success" | "error";

export interface PiPetRuntimeState {
	state: PiPetState;
	activeTools: number;
	sawError: boolean;
}

const PET_ART_ID = "pi-pet:art";
const RESET_TO_IDLE_MS = 1500;
const SUCCESS_RESET_TO_IDLE_MS = 5000;

const PET_FRAMES: Record<PiPetState, string[]> = {
	idle: [" /\\_/\\", "( o.o )", " > ^ <"],
	thinking: [" /\\_/\\", "( -.- )", " > ? <"],
	working: [" /\\_/\\", "( o.o )", " /|_|\\"],
	success: [" /\\_/\\", "( ^.^ )", " > ★ <"],
	error: [" /\\_/\\", "( x.x )", " > ! <"],
};

export function createPiPetRuntimeState(): PiPetRuntimeState {
	return {
		state: "idle",
		activeTools: 0,
		sawError: false,
	};
}

export function setPiPetState(runtime: PiPetRuntimeState, state: PiPetState): void {
	runtime.state = state;
}

export function renderPiPetLines(runtime: PiPetRuntimeState): string[] {
	return PET_FRAMES[runtime.state];
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
	if (state === "thinking") return "accent";
	if (state === "working") return "mdLink";
	if (state === "success") return "thinkingHigh";
	if (state === "error") return "mdHeading";
	return "text";
}

export function getPiPetResetDelay(
	state: PiPetState,
	resetToIdleMs = RESET_TO_IDLE_MS,
	successResetToIdleMs = SUCCESS_RESET_TO_IDLE_MS,
): number {
	return state === "success" ? successResetToIdleMs : resetToIdleMs;
}

export function createPiPetExtension(options: { resetToIdleMs?: number; successResetToIdleMs?: number } = {}) {
	return function piPetExtension(pi: ExtensionAPI) {
		const runtime = createPiPetRuntimeState();
		const resetToIdleMs = options.resetToIdleMs ?? RESET_TO_IDLE_MS;
		const successResetToIdleMs = options.successResetToIdleMs ?? SUCCESS_RESET_TO_IDLE_MS;
		let resetTimer: ReturnType<typeof setTimeout> | undefined;

		function clearResetTimer(): void {
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = undefined;
		}

		function publish(): void {
			updateCompanionWidget(pi.events, {
				id: PET_ART_ID,
				region: "visual",
				order: 10,
				lines: renderPiPetLines(runtime),
				tone: toneForState(runtime.state),
			});
		}

		function scheduleIdle(): void {
			clearResetTimer();
			resetTimer = setTimeout(() => {
				setPiPetState(runtime, "idle");
				runtime.sawError = false;
				publish();
			}, getPiPetResetDelay(runtime.state, resetToIdleMs, successResetToIdleMs));
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
		});
	};
}

export default createPiPetExtension();
