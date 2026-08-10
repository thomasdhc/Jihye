import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	isSubagentProgressEvent,
	SUBAGENT_PROGRESS_EVENT,
	type SubagentProgressPhase,
} from "../../subagent/progress-events.ts";
import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
	type CompanionWidgetTone,
} from "../api.ts";
import {
	PI_PET_ASSETS,
	getPiPetAnimationInterval,
	isPiPetStateAnimated,
	resolvePiPetStateElements,
	validatePiPetAssets,
	type PiPetAssetCatalog,
	type PiPetState,
} from "./assets.ts";

export type { PiPetState } from "./assets.ts";

export interface PiPetInstance {
	state: PiPetState;
	tick: number;
	order: number;
	agentName?: string;
}

export interface PiPetRuntimeState {
	state: PiPetState;
	tick: number;
	activeTools: number;
	sawError: boolean;
	subagentPets: Map<string, PiPetInstance>;
	nextSubagentOrder: number;
}

interface PiPetEventPayload {
	isError?: boolean;
	toolName?: string;
	toolCallId?: string;
	args?: unknown;
	phase?: SubagentProgressPhase;
}

const PET_ART_ID = "pi-pet:art";
const SUBAGENT_PET_ID_PREFIX = "pi-pet:subagent:";
const RESET_TO_IDLE_MS = 1500;
const SUCCESS_RESET_TO_IDLE_MS = 5000;

export function createPiPetRuntimeState(): PiPetRuntimeState {
	return {
		state: "idle",
		tick: 0,
		activeTools: 0,
		sawError: false,
		subagentPets: new Map(),
		nextSubagentOrder: 0,
	};
}

export function setPiPetState(runtime: PiPetRuntimeState, state: PiPetState): void {
	if (runtime.state === state) return;
	runtime.state = state;
	runtime.tick = 0;
}

function setSubagentPetState(pet: PiPetInstance, state: PiPetState): void {
	if (pet.state === state) return;
	pet.state = state;
	pet.tick = 0;
}

export function renderPiPetStateLines(
	state: PiPetState,
	agentName?: string,
	tick = 0,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): string[] {
	return resolvePiPetStateElements(state, tick, agentName, assets).map((line) => {
		const width = visibleWidth(line);
		if (width !== assets.frameWidth) {
			throw new Error(
				`[pi-pet] frame line has display width ${width}; expected ${assets.frameWidth}: ${JSON.stringify(line)}`,
			);
		}
		return line;
	});
}

export function renderPiPetLines(
	runtime: PiPetRuntimeState,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): string[] {
	return renderPiPetStateLines(runtime.state, undefined, runtime.tick, assets);
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
			runtime.tick = 0;
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
					tick: 0,
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
			if (subagent) setSubagentPetState(subagent, payload?.isError ? "error" : "success");
			if (payload?.isError) {
				runtime.sawError = true;
				setPiPetState(runtime, "error");
			} else if (runtime.activeTools === 0 && !runtime.sawError) {
				setPiPetState(runtime, "thinking");
			}
			break;
		}
		case "subagent_progress": {
			const subagent = payload?.toolCallId
				? runtime.subagentPets.get(payload.toolCallId)
				: undefined;
			if (!subagent || subagent.state === "success" || subagent.state === "error") break;
			if (payload?.phase === "thinking" || payload?.phase === "working") {
				setSubagentPetState(subagent, payload.phase);
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

export interface PiPetExtensionOptions {
	resetToIdleMs?: number;
	successResetToIdleMs?: number;
	animationIntervalMs?: number;
	assets?: PiPetAssetCatalog;
}

interface ScheduledAnimation {
	key: string;
	timer: ReturnType<typeof setTimeout>;
}

export function createPiPetExtension(options: PiPetExtensionOptions = {}) {
	return function piPetExtension(pi: ExtensionAPI) {
		const assets = options.assets ?? PI_PET_ASSETS;
		validatePiPetAssets(assets);
		const runtime = createPiPetRuntimeState();
		const resetToIdleMs = options.resetToIdleMs ?? RESET_TO_IDLE_MS;
		const successResetToIdleMs = options.successResetToIdleMs ?? SUCCESS_RESET_TO_IDLE_MS;
		let sessionActive = false;
		let resetTimer: ReturnType<typeof setTimeout> | undefined;
		let mainAnimation: ScheduledAnimation | undefined;
		const subagentRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
		const subagentAnimations = new Map<string, ScheduledAnimation>();
		const unsubscribeSubagentProgress = pi.events.on(SUBAGENT_PROGRESS_EVENT, (payload) => {
			if (!isSubagentProgressEvent(payload)) return;
			const pet = runtime.subagentPets.get(payload.toolCallId);
			if (!pet || pet.state === "success" || pet.state === "error") return;
			applyPiPetEvent(runtime, "subagent_progress", payload);
			publishSubagentPet(payload.toolCallId);
			ensureSubagentAnimation(payload.toolCallId);
		});

		function animationInterval(state: PiPetState, agentName?: string): number {
			return options.animationIntervalMs ?? getPiPetAnimationInterval(state, agentName, assets);
		}

		function clearResetTimer(): void {
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = undefined;
		}

		function clearMainAnimation(): void {
			if (mainAnimation) clearTimeout(mainAnimation.timer);
			mainAnimation = undefined;
		}

		function clearSubagentAnimation(toolCallId: string): void {
			const animation = subagentAnimations.get(toolCallId);
			if (animation) clearTimeout(animation.timer);
			subagentAnimations.delete(toolCallId);
		}

		function clearSubagentRemovalTimer(toolCallId: string): void {
			const timer = subagentRemovalTimers.get(toolCallId);
			if (timer) clearTimeout(timer);
			subagentRemovalTimers.delete(toolCallId);
		}

		function clearSubagentPets(removeContributions: boolean): void {
			for (const toolCallId of runtime.subagentPets.keys()) {
				clearSubagentAnimation(toolCallId);
				clearSubagentRemovalTimer(toolCallId);
				if (removeContributions) removeCompanionWidgetContribution(pi.events, getSubagentPetContributionId(toolCallId));
			}
			for (const toolCallId of subagentAnimations.keys()) clearSubagentAnimation(toolCallId);
			for (const toolCallId of subagentRemovalTimers.keys()) clearSubagentRemovalTimer(toolCallId);
			runtime.subagentPets.clear();
		}

		function publishMainPet(): void {
			updateCompanionWidget(pi.events, {
				id: PET_ART_ID,
				region: "visual",
				order: 10,
				lines: renderPiPetLines(runtime, assets),
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
				lines: renderPiPetStateLines(pet.state, pet.agentName, pet.tick, assets),
				tone: toneForState(pet.state),
			});
		}

		function publish(): void {
			publishMainPet();
			for (const toolCallId of runtime.subagentPets.keys()) publishSubagentPet(toolCallId);
		}

		function ensureMainAnimation(): void {
			if (!sessionActive || !isPiPetStateAnimated(runtime.state, undefined, assets)) {
				clearMainAnimation();
				return;
			}
			const intervalMs = animationInterval(runtime.state);
			const key = `${runtime.state}:${intervalMs}`;
			if (mainAnimation?.key === key) return;
			clearMainAnimation();
			mainAnimation = {
				key,
				timer: setTimeout(() => {
					mainAnimation = undefined;
					if (!sessionActive || !isPiPetStateAnimated(runtime.state, undefined, assets)) return;
					runtime.tick += 1;
					publishMainPet();
					ensureMainAnimation();
				}, intervalMs),
			};
		}

		function ensureSubagentAnimation(toolCallId: string): void {
			const pet = runtime.subagentPets.get(toolCallId);
			if (!sessionActive || !pet || !isPiPetStateAnimated(pet.state, pet.agentName, assets)) {
				clearSubagentAnimation(toolCallId);
				return;
			}
			const intervalMs = animationInterval(pet.state, pet.agentName);
			const key = `${pet.state}:${pet.agentName ?? "default"}:${intervalMs}`;
			if (subagentAnimations.get(toolCallId)?.key === key) return;
			clearSubagentAnimation(toolCallId);
			const animation: ScheduledAnimation = {
				key,
				timer: setTimeout(() => {
					subagentAnimations.delete(toolCallId);
					const current = runtime.subagentPets.get(toolCallId);
					if (!sessionActive || !current || !isPiPetStateAnimated(current.state, current.agentName, assets)) return;
					current.tick += 1;
					publishSubagentPet(toolCallId);
					ensureSubagentAnimation(toolCallId);
				}, intervalMs),
			};
			subagentAnimations.set(toolCallId, animation);
		}

		function syncAnimationTimers(): void {
			ensureMainAnimation();
			for (const toolCallId of subagentAnimations.keys()) {
				if (!runtime.subagentPets.has(toolCallId)) clearSubagentAnimation(toolCallId);
			}
			for (const toolCallId of runtime.subagentPets.keys()) ensureSubagentAnimation(toolCallId);
		}

		function scheduleIdle(): void {
			clearResetTimer();
			resetTimer = setTimeout(() => {
				setPiPetState(runtime, "idle");
				runtime.sawError = false;
				publish();
				syncAnimationTimers();
			}, getPiPetResetDelay(runtime.state, resetToIdleMs, successResetToIdleMs));
		}

		function scheduleSubagentRemoval(toolCallId: string): void {
			const pet = runtime.subagentPets.get(toolCallId);
			if (!pet) return;
			clearSubagentRemovalTimer(toolCallId);
			const timer = setTimeout(() => {
				clearSubagentAnimation(toolCallId);
				runtime.subagentPets.delete(toolCallId);
				subagentRemovalTimers.delete(toolCallId);
				removeCompanionWidgetContribution(pi.events, getSubagentPetContributionId(toolCallId));
			}, getPiPetResetDelay(pet.state, resetToIdleMs, successResetToIdleMs));
			subagentRemovalTimers.set(toolCallId, timer);
		}

		pi.on("session_start", async () => {
			sessionActive = true;
			clearResetTimer();
			clearMainAnimation();
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "session_start");
			publish();
			syncAnimationTimers();
		});

		pi.on("before_agent_start", async () => {
			clearResetTimer();
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "before_agent_start");
			publish();
			syncAnimationTimers();
		});

		pi.on("agent_start", async () => {
			clearResetTimer();
			clearSubagentPets(true);
			applyPiPetEvent(runtime, "agent_start");
			publish();
			syncAnimationTimers();
		});

		pi.on("tool_execution_start", async (event) => {
			const toolEvent = event as { toolName?: string; toolCallId?: string; args?: unknown };
			applyPiPetEvent(runtime, "tool_execution_start", toolEvent);
			publish();
			syncAnimationTimers();
		});

		pi.on("tool_execution_end", async (event) => {
			const toolEvent = event as { isError?: boolean; toolName?: string; toolCallId?: string };
			applyPiPetEvent(runtime, "tool_execution_end", { ...toolEvent, isError: Boolean(toolEvent.isError) });
			publish();
			syncAnimationTimers();
			if (toolEvent.toolName === "subagent" && toolEvent.toolCallId) scheduleSubagentRemoval(toolEvent.toolCallId);
		});

		pi.on("agent_settled", async () => {
			applyPiPetEvent(runtime, "agent_settled");
			publish();
			syncAnimationTimers();
			scheduleIdle();
		});

		pi.on("session_shutdown", async () => {
			sessionActive = false;
			unsubscribeSubagentProgress();
			clearResetTimer();
			clearMainAnimation();
			clearSubagentPets(true);
			removeCompanionWidgetContribution(pi.events, PET_ART_ID);
		});
	};
}

export default createPiPetExtension();
