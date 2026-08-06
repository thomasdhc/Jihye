import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
	type CompanionWidgetTone,
} from "../lib/companion-widget.ts";

export type PiPetState = "idle" | "thinking" | "working" | "success" | "error";

export interface PiPetInstance {
	state: PiPetState;
	order: number;
	agentName?: string;
}

export interface PiPetRuntimeState {
	state: PiPetState;
	activeTools: number;
	sawError: boolean;
	subagentPets: Map<string, PiPetInstance>;
	nextSubagentOrder: number;
}

interface PiPetLayout {
	top: string;
	middle: Record<PiPetState, string>;
	bottom: string | Record<PiPetState, string>;
}

interface PiPetEventPayload {
	isError?: boolean;
	toolName?: string;
	toolCallId?: string;
	args?: unknown;
}

const PET_ART_ID = "pi-pet:art";
const SUBAGENT_PET_ID_PREFIX = "pi-pet:subagent:";
const RESET_TO_IDLE_MS = 1500;
const SUCCESS_RESET_TO_IDLE_MS = 5000;

const PET_FRAME_WIDTH = 7;

const CAT_FACES: Record<PiPetState, string> = {
	idle: "( o.o )",
	thinking: "( -.- )",
	working: "( o.o )",
	success: "( ^.^ )",
	error: "( x.x )",
};

const DEFAULT_PET_LAYOUT: PiPetLayout = {
	top: " /\\_/\\",
	middle: CAT_FACES,
	bottom: {
		idle: " > ^ <",
		thinking: " > ? <",
		working: " /|_|\\",
		success: " > ★ <",
		error: " > ! <",
	},
};

const SUBAGENT_PET_LAYOUTS: Record<string, PiPetLayout> = {
	scout: {
		top: " /\\ /\\ ",
		middle: {
			idle: " (o|o) ",
			thinking: " (-|-) ",
			working: " (o|o) ",
			success: " (^|^) ",
			error: " (x|x) ",
		},
		bottom: " / V \\ ",
	},
	researcher: {
		top: " ,___, ",
		middle: {
			idle: " (o,o) ",
			thinking: " (-,-) ",
			working: " (o,o) ",
			success: " (^,^) ",
			error: " (x,x) ",
		},
		bottom: " /===\\ ",
	},
	reviewer: {
		top: " .---. ",
		middle: {
			idle: " (o)-Q ",
			thinking: " (?)-Q ",
			working: " (o)-Q ",
			success: " (+)-Q ",
			error: " (x)-Q ",
		},
		bottom: " /___\\ ",
	},
	worker: {
		top: " /===\\ ",
		middle: CAT_FACES,
		bottom: " /|_|\\ ",
	},
	coordinator: {
		top: " \\ | / ",
		middle: CAT_FACES,
		bottom: " /_^_\\ ",
	},
};

export function createPiPetRuntimeState(): PiPetRuntimeState {
	return {
		state: "idle",
		activeTools: 0,
		sawError: false,
		subagentPets: new Map(),
		nextSubagentOrder: 0,
	};
}

export function setPiPetState(runtime: PiPetRuntimeState, state: PiPetState): void {
	runtime.state = state;
}

export function renderPiPetStateLines(state: PiPetState, agentName?: string): string[] {
	const layout = agentName ? (SUBAGENT_PET_LAYOUTS[agentName] ?? DEFAULT_PET_LAYOUT) : DEFAULT_PET_LAYOUT;
	const bottom = typeof layout.bottom === "string" ? layout.bottom : layout.bottom[state];
	return [layout.top, layout.middle[state], bottom].map((line) => line.padEnd(PET_FRAME_WIDTH));
}

export function renderPiPetLines(runtime: PiPetRuntimeState): string[] {
	return renderPiPetStateLines(runtime.state);
}

function getSubagentToolCallId(payload?: PiPetEventPayload): string | undefined {
	return payload?.toolName === "subagent" && payload.toolCallId ? payload.toolCallId : undefined;
}

function getSubagentAgentName(payload?: PiPetEventPayload): string | undefined {
	if (!payload?.args || typeof payload.args !== "object") return undefined;
	const agentName = (payload.args as { agent?: unknown }).agent;
	return typeof agentName === "string" && agentName.trim() ? agentName.trim() : undefined;
}

export function applyPiPetEvent(
	runtime: PiPetRuntimeState,
	event: string,
	payload?: PiPetEventPayload,
): PiPetState {
	switch (event) {
		case "session_start":
			runtime.activeTools = 0;
			runtime.sawError = false;
			runtime.subagentPets.clear();
			runtime.nextSubagentOrder = 0;
			setPiPetState(runtime, "idle");
			break;
		case "before_agent_start":
		case "agent_start":
			runtime.activeTools = 0;
			runtime.sawError = false;
			runtime.subagentPets.clear();
			runtime.nextSubagentOrder = 0;
			setPiPetState(runtime, "thinking");
			break;
		case "tool_execution_start": {
			runtime.activeTools += 1;
			const subagentId = getSubagentToolCallId(payload);
			if (subagentId && !runtime.subagentPets.has(subagentId)) {
				runtime.subagentPets.set(subagentId, {
					state: "working",
					order: runtime.nextSubagentOrder++,
					agentName: getSubagentAgentName(payload),
				});
			}
			setPiPetState(runtime, "working");
			break;
		}
		case "tool_execution_end": {
			runtime.activeTools = Math.max(0, runtime.activeTools - 1);
			const subagentId = getSubagentToolCallId(payload);
			const subagent = subagentId ? runtime.subagentPets.get(subagentId) : undefined;
			if (subagent) subagent.state = payload?.isError ? "error" : "success";
			if (payload?.isError) {
				runtime.sawError = true;
				setPiPetState(runtime, "error");
			} else if (runtime.activeTools === 0 && !runtime.sawError) {
				setPiPetState(runtime, "thinking");
			}
			break;
		}
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

function getSubagentPetContributionId(toolCallId: string): string {
	return `${SUBAGENT_PET_ID_PREFIX}${toolCallId}`;
}

export function createPiPetExtension(options: { resetToIdleMs?: number; successResetToIdleMs?: number } = {}) {
	return function piPetExtension(pi: ExtensionAPI) {
		const runtime = createPiPetRuntimeState();
		const resetToIdleMs = options.resetToIdleMs ?? RESET_TO_IDLE_MS;
		const successResetToIdleMs = options.successResetToIdleMs ?? SUCCESS_RESET_TO_IDLE_MS;
		let resetTimer: ReturnType<typeof setTimeout> | undefined;
		const subagentRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();

		function clearResetTimer(): void {
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = undefined;
		}

		function clearSubagentRemovalTimer(toolCallId: string): void {
			const timer = subagentRemovalTimers.get(toolCallId);
			if (timer) clearTimeout(timer);
			subagentRemovalTimers.delete(toolCallId);
		}

		function clearSubagentPets(removeContributions: boolean): void {
			for (const toolCallId of runtime.subagentPets.keys()) {
				clearSubagentRemovalTimer(toolCallId);
				if (removeContributions) removeCompanionWidgetContribution(pi.events, getSubagentPetContributionId(toolCallId));
			}
			runtime.subagentPets.clear();
		}

		function publishMainPet(): void {
			updateCompanionWidget(pi.events, {
				id: PET_ART_ID,
				region: "visual",
				order: 10,
				lines: renderPiPetLines(runtime),
				tone: toneForState(runtime.state),
			});
		}

		function publishSubagentPet(toolCallId: string): void {
			const pet = runtime.subagentPets.get(toolCallId);
			if (!pet) return;
			updateCompanionWidget(pi.events, {
				id: getSubagentPetContributionId(toolCallId),
				region: "visual",
				order: 20 + pet.order,
				lines: renderPiPetStateLines(pet.state, pet.agentName),
				tone: toneForState(pet.state),
			});
		}

		function publish(): void {
			publishMainPet();
			for (const toolCallId of runtime.subagentPets.keys()) publishSubagentPet(toolCallId);
		}

		function scheduleIdle(): void {
			clearResetTimer();
			resetTimer = setTimeout(() => {
				setPiPetState(runtime, "idle");
				runtime.sawError = false;
				publish();
			}, getPiPetResetDelay(runtime.state, resetToIdleMs, successResetToIdleMs));
		}

		function scheduleSubagentRemoval(toolCallId: string): void {
			const pet = runtime.subagentPets.get(toolCallId);
			if (!pet) return;
			clearSubagentRemovalTimer(toolCallId);
			const timer = setTimeout(() => {
				runtime.subagentPets.delete(toolCallId);
				subagentRemovalTimers.delete(toolCallId);
				removeCompanionWidgetContribution(pi.events, getSubagentPetContributionId(toolCallId));
			}, getPiPetResetDelay(pet.state, resetToIdleMs, successResetToIdleMs));
			subagentRemovalTimers.set(toolCallId, timer);
		}

		pi.on("session_start", async () => {
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "session_start");
			publish();
		});

		pi.on("before_agent_start", async () => {
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "before_agent_start");
			publish();
		});

		pi.on("agent_start", async () => {
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "agent_start");
			publish();
		});

		pi.on("tool_execution_start", async (event) => {
			const toolEvent = event as { toolName?: string; toolCallId?: string; args?: unknown };
			applyPiPetEvent(runtime, "tool_execution_start", toolEvent);
			publish();
		});

		pi.on("tool_execution_end", async (event) => {
			const toolEvent = event as { isError?: boolean; toolName?: string; toolCallId?: string };
			applyPiPetEvent(runtime, "tool_execution_end", { ...toolEvent, isError: Boolean(toolEvent.isError) });
			publish();
			if (toolEvent.toolName === "subagent" && toolEvent.toolCallId) scheduleSubagentRemoval(toolEvent.toolCallId);
		});

		pi.on("agent_settled", async () => {
			applyPiPetEvent(runtime, "agent_settled");
			publish();
			scheduleIdle();
		});

		pi.on("session_shutdown", async () => {
			clearResetTimer();
			clearSubagentPets(true);
			removeCompanionWidgetContribution(pi.events, PET_ART_ID);
		});
	};
}

export default createPiPetExtension();
