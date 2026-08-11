import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	getPiPetResetDelay,
	renderPiPetLines,
	renderPiPetStateLines,
} from "../../extensions/widget/pi-pet/extension.ts";
import { SUBAGENT_PROGRESS_EVENT } from "../../extensions/subagent/progress-events.ts";
import { COMPANION_WIDGET_UPDATE_EVENT, type CompanionWidgetUpdate } from "../../extensions/widget/api.ts";
import {
	PI_PET_ASSETS,
	SUBAGENT_PI_PET_ASSETS,
	resolvePiPetStateElements,
	type PiPetAssetCatalog,
} from "../../extensions/widget/pi-pet/assets.ts";

const TEST_ANIMATION_ASSETS = {
	...PI_PET_ASSETS,
	default: {
		...PI_PET_ASSETS.default,
		working: { elements: ["topline", "middle!", ["frame-a", "frame-b"]] },
	},
	subagents: {
		...PI_PET_ASSETS.subagents,
		scout: {
			...PI_PET_ASSETS.subagents.scout,
			working: { elements: ["scout-t", "scout-m", ["scout-0", "scout-1"]] },
		},
	},
} satisfies PiPetAssetCatalog;

test("maps lifecycle events to pet states", () => {
	const runtime = createPiPetRuntimeState();

	assert.equal(applyPiPetEvent(runtime, "before_agent_start"), "thinking");
	assert.equal(applyPiPetEvent(runtime, "tool_execution_start"), "working");
	assert.equal(runtime.activeTools, 1);
	assert.equal(applyPiPetEvent(runtime, "tool_execution_end"), "thinking");
	assert.equal(runtime.activeTools, 0);
	assert.equal(applyPiPetEvent(runtime, "agent_settled"), "success");
});

test("keeps an error reaction through agent settlement", () => {
	const runtime = createPiPetRuntimeState();

	applyPiPetEvent(runtime, "agent_start");
	applyPiPetEvent(runtime, "tool_execution_start");
	assert.equal(applyPiPetEvent(runtime, "tool_execution_end", { isError: true }), "error");
	assert.equal(runtime.sawError, true);
	assert.equal(applyPiPetEvent(runtime, "agent_settled"), "error");
});

test("tracks top-level subagent roles and states independently", () => {
	const runtime = createPiPetRuntimeState();

	applyPiPetEvent(runtime, "tool_execution_start", {
		toolName: "subagent",
		toolCallId: "a",
		args: { agent: "scout" },
	});
	applyPiPetEvent(runtime, "tool_execution_start", {
		toolName: "subagent",
		toolCallId: "b",
		args: { agent: "researcher" },
	});
	assert.equal(runtime.subagentPets.get("a")?.state, "working");
	assert.equal(runtime.subagentPets.get("a")?.agentName, "scout");
	assert.equal(runtime.subagentPets.get("b")?.state, "working");
	assert.equal(runtime.subagentPets.get("b")?.agentName, "researcher");
	assert.notEqual(runtime.subagentPets.get("a")?.order, runtime.subagentPets.get("b")?.order);

	runtime.tick = 3;
	runtime.subagentPets.get("a")!.tick = 5;
	assert.equal(runtime.subagentPets.get("b")?.tick, 0);
	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "a" });
	assert.equal(runtime.subagentPets.get("a")?.tick, 0, "subagent state change resets only its tick");
	assert.equal(runtime.tick, 3, "main tick remains independent while still working");

	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "b", isError: true });
	assert.equal(runtime.subagentPets.get("a")?.state, "success");
	assert.equal(runtime.subagentPets.get("b")?.state, "error");
	assert.equal(runtime.subagentPets.get("b")?.tick, 0);
	assert.equal(runtime.tick, 0, "main state change resets its tick");
});

test("applies concurrent subagent phases independently and ignores unknown or terminal IDs", () => {
	const runtime = createPiPetRuntimeState();

	for (const toolCallId of ["a", "b"]) {
		applyPiPetEvent(runtime, "tool_execution_start", { toolName: "subagent", toolCallId });
	}
	runtime.subagentPets.get("a")!.tick = 4;
	runtime.subagentPets.get("b")!.tick = 7;

	applyPiPetEvent(runtime, "subagent_progress", { toolCallId: "a", phase: "thinking" });
	assert.equal(runtime.subagentPets.get("a")?.state, "thinking");
	assert.equal(runtime.subagentPets.get("a")?.tick, 0, "a phase transition resets its animation");
	assert.equal(runtime.subagentPets.get("b")?.state, "working");
	assert.equal(runtime.subagentPets.get("b")?.tick, 7, "concurrent calls retain independent animation state");

	runtime.subagentPets.get("a")!.tick = 3;
	applyPiPetEvent(runtime, "subagent_progress", { toolCallId: "a", phase: "working" });
	assert.equal(runtime.subagentPets.get("a")?.state, "working");
	assert.equal(runtime.subagentPets.get("a")?.tick, 0, "returning to child tool activity restarts working animation");

	applyPiPetEvent(runtime, "subagent_progress", { toolCallId: "unknown", phase: "thinking" });
	assert.equal(runtime.subagentPets.size, 2);

	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "a" });
	applyPiPetEvent(runtime, "subagent_progress", { toolCallId: "a", phase: "working" });
	assert.equal(runtime.subagentPets.get("a")?.state, "success", "parent end remains terminal authority");
});

test("renders persistent pet-owned artwork without status text", () => {
	const runtime = createPiPetRuntimeState();
	assert.deepEqual(renderPiPetLines(runtime), resolvePiPetStateElements("idle", 0));
});

test("resolves injected animation frames without runtime padding", () => {
	assert.deepEqual(renderPiPetStateLines("working", undefined, 0, TEST_ANIMATION_ASSETS), [
		"topline",
		"middle!",
		"frame-a",
	]);
	assert.deepEqual(renderPiPetStateLines("working", undefined, 1, TEST_ANIMATION_ASSETS), [
		"topline",
		"middle!",
		"frame-b",
	]);
});

test("renders a distinct role-specific layout for each bundled subagent", () => {
	const frames = Object.keys(SUBAGENT_PI_PET_ASSETS).map((agentName) =>
		renderPiPetStateLines("working", agentName).join("\n"),
	);

	assert.equal(new Set(frames).size, frames.length);
});

test("falls back to the generic pet when subagent role metadata is absent or custom", () => {
	const runtime = createPiPetRuntimeState();
	const agentArgs = [undefined, {}, { agent: "   " }, { agent: 42 }, { agent: "custom-agent" }];

	for (const [index, args] of agentArgs.entries()) {
		const toolCallId = `fallback-${index}`;
		applyPiPetEvent(runtime, "tool_execution_start", { toolName: "subagent", toolCallId, args });
		const pet = runtime.subagentPets.get(toolCallId);
		assert.deepEqual(renderPiPetStateLines(pet?.state ?? "working", pet?.agentName), renderPiPetStateLines("working"));
	}
});

test("keeps successful reactions visible longer than other settled states", () => {
	assert.equal(getPiPetResetDelay("success"), 5000);
	assert.equal(getPiPetResetDelay("error"), 1500);
});

test("publishes one persistent pet contribution with distinct lifecycle tones", async () => {
	type Handler = (event: unknown) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	const updates: CompanionWidgetUpdate[] = [];

	createPiPetExtension({ resetToIdleMs: 1, successResetToIdleMs: 1 })({
		events: {
			emit(event: string, payload: CompanionWidgetUpdate) {
				assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
				updates.push(payload);
			},
			on(event: string, handler: Handler) {
				handlers.set(event, handler);
				return () => handlers.delete(event);
			},
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
	} as never);

	await handlers.get("session_start")?.({});
	try {
		assert.equal(updates.at(-1)?.id, "pi-pet:art");
		assert.equal(updates.at(-1)?.contribution?.tone, "text");

		await handlers.get("before_agent_start")?.({});
		assert.equal(updates.at(-1)?.contribution?.tone, "accent");

		await handlers.get("tool_execution_start")?.({});
		assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");

		await handlers.get("tool_execution_end")?.({ isError: true });
		assert.equal(updates.at(-1)?.contribution?.tone, "mdHeading");

		await handlers.get("session_start")?.({});
		await handlers.get("agent_settled")?.({});
		assert.equal(updates.at(-1)?.contribution?.tone, "thinkingHigh");
		assert.ok(updates.every((update) => update.id === "pi-pet:art"));
	} finally {
		await handlers.get("session_shutdown")?.({});
	}
});

test("keeps idle static, animates active work, and stops publishing on shutdown", async () => {
	type Handler = (event: unknown) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	const updates: CompanionWidgetUpdate[] = [];

	createPiPetExtension({
		animationIntervalMs: 2,
		resetToIdleMs: 100,
		successResetToIdleMs: 100,
		assets: TEST_ANIMATION_ASSETS,
	})({
		events: {
			emit(event: string, payload: CompanionWidgetUpdate) {
				assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
				updates.push(payload);
			},
			on(event: string, handler: Handler) {
				handlers.set(event, handler);
				return () => handlers.delete(event);
			},
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
	} as never);

	await handlers.get("tool_execution_start")?.({
		toolName: "subagent",
		toolCallId: "before-session",
		args: { agent: "scout" },
	});
	const beforeSessionCount = updates.length;
	await new Promise((resolve) => setTimeout(resolve, 8));
	assert.equal(updates.length, beforeSessionCount, "factory and pre-session events do not start timers");

	await handlers.get("session_start")?.({});
	const idleUpdateCount = updates.length;
	await new Promise((resolve) => setTimeout(resolve, 8));
	assert.equal(updates.length, idleUpdateCount, "idle pets must not produce recurring terminal output");

	await handlers.get("tool_execution_start")?.({
		toolName: "subagent",
		toolCallId: "animated",
		args: { agent: "scout" },
	});
	try {
		await new Promise((resolve) => setTimeout(resolve, 12));
		assert.ok(updates.filter((update) => update.id === "pi-pet:art" && update.contribution).length > 2);
		assert.ok(updates.filter((update) => update.id === "pi-pet:subagent:animated" && update.contribution).length > 1);
	} finally {
		await handlers.get("session_shutdown")?.({});
	}

	const afterShutdownCount = updates.length;
	await new Promise((resolve) => setTimeout(resolve, 8));
	assert.equal(updates.length, afterShutdownCount, "animation and removal timers are cleaned on shutdown");
	assert.equal(updates.findLast((update) => update.id === "pi-pet:art")?.contribution, undefined);
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:animated")?.contribution, undefined);
});

test("publishes role-specific top-level subagent pets through settled states", async () => {
	type Handler = (event: unknown) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	const updates: CompanionWidgetUpdate[] = [];

	createPiPetExtension({ resetToIdleMs: 1, successResetToIdleMs: 1 })({
		events: {
			emit(event: string, payload: CompanionWidgetUpdate) {
				assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
				updates.push(payload);
			},
			on(event: string, handler: Handler) {
				handlers.set(event, handler);
				return () => handlers.delete(event);
			},
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
	} as never);

	await handlers.get("tool_execution_start")?.({
		toolName: "subagent",
		toolCallId: "subagent-a",
		args: { agent: "scout" },
	});
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-a");
	assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");
	assert.deepEqual(updates.at(-1)?.contribution?.lines, renderPiPetStateLines("working", "scout"));

	await handlers.get("tool_execution_start")?.({
		toolName: "subagent",
		toolCallId: "subagent-b",
		args: { agent: "researcher" },
	});
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-b");
	assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");
	assert.deepEqual(updates.at(-1)?.contribution?.lines, renderPiPetStateLines("working", "researcher"));
	assert.notEqual(
		updates.find((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution?.order,
		updates.find((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution?.order,
	);

	await handlers.get(SUBAGENT_PROGRESS_EVENT)?.({ toolCallId: "subagent-a", phase: "thinking" });
	const scoutThinking = updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution;
	assert.equal(scoutThinking?.tone, "accent");
	assert.deepEqual(scoutThinking?.lines, renderPiPetStateLines("thinking", "scout"));
	assert.deepEqual(
		updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution?.lines,
		renderPiPetStateLines("working", "researcher"),
		"a progress event must not change concurrent call b",
	);
	const beforeUnknown = updates.length;
	await handlers.get(SUBAGENT_PROGRESS_EVENT)?.({ toolCallId: "unknown", phase: "thinking" });
	assert.equal(updates.length, beforeUnknown, "unknown parent IDs are ignored");

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-a" });
	const scoutSuccess = updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution;
	assert.equal(scoutSuccess?.tone, "thinkingHigh");
	assert.deepEqual(scoutSuccess?.lines, renderPiPetStateLines("success", "scout"));
	const beforeLate = updates.length;
	await handlers.get(SUBAGENT_PROGRESS_EVENT)?.({ toolCallId: "subagent-a", phase: "working" });
	assert.equal(updates.length, beforeLate, "late progress cannot override the parent terminal event");

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-b", isError: true });
	const researcherError = updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution;
	assert.equal(researcherError?.tone, "mdHeading");
	assert.deepEqual(researcherError?.lines, renderPiPetStateLines("error", "researcher"));

	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution, undefined);
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution, undefined);

	await handlers.get("session_shutdown")?.({});
	assert.equal(handlers.has(SUBAGENT_PROGRESS_EVENT), false, "shutdown unsubscribes the inter-extension listener");
});
