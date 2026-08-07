import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	getPiPetResetDelay,
	renderPiPetLines,
	renderPiPetStateLines,
} from "../extensions/widget/pi-pet.ts";
import { COMPANION_WIDGET_UPDATE_EVENT, type CompanionWidgetUpdate } from "../extensions/widget/api.ts";

const ROLE_PET_WORKING_FRAMES = {
	scout: [" /\\ /\\ ", " (o|o) ", " / V \\ "],
	researcher: [" ,___, ", " (o,o) ", " /===\\ "],
	reviewer: [" .---. ", " (o)-Q ", " /___\\ "],
	worker: [" /===\\ ", "( o.o )", " /|_|\\ "],
	coordinator: [" \\ | / ", "( o.o )", " /_^_\\ "],
} as const;

const PET_STATES = ["idle", "thinking", "working", "success", "error"] as const;

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

	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "a" });
	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "b", isError: true });
	assert.equal(runtime.subagentPets.get("a")?.state, "success");
	assert.equal(runtime.subagentPets.get("b")?.state, "error");
});

test("renders persistent pet-owned artwork without status text", () => {
	const runtime = createPiPetRuntimeState();
	assert.deepEqual(renderPiPetLines(runtime), [" /\\_/\\ ", "( o.o )", " > ^ < "]);
});

test("renders a compact role-specific layout for each bundled subagent", () => {
	for (const [agentName, expected] of Object.entries(ROLE_PET_WORKING_FRAMES)) {
		assert.deepEqual(renderPiPetStateLines("working", agentName), expected, agentName);

		for (const state of PET_STATES) {
			const lines = renderPiPetStateLines(state, agentName);
			assert.deepEqual(lines.map((line) => line.length), [7, 7, 7], `${agentName} ${state} dimensions`);
			assert.equal(lines[0], expected[0], `${agentName} ${state} silhouette`);
			assert.equal(lines[2], expected[2], `${agentName} ${state} role prop`);
		}
	}
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

test("pads pet frame rows to keep duplicated pets aligned", () => {
	const lines = renderPiPetStateLines("working");
	assert.deepEqual(lines.map((line) => line.length), [7, 7, 7]);
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
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
	} as never);

	await handlers.get("session_start")?.({});
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
	assert.deepEqual(updates.at(-1)?.contribution?.lines, ROLE_PET_WORKING_FRAMES.scout);

	await handlers.get("tool_execution_start")?.({
		toolName: "subagent",
		toolCallId: "subagent-b",
		args: { agent: "researcher" },
	});
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-b");
	assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");
	assert.deepEqual(updates.at(-1)?.contribution?.lines, ROLE_PET_WORKING_FRAMES.researcher);
	assert.notEqual(
		updates.find((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution?.order,
		updates.find((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution?.order,
	);

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-a" });
	const scoutSuccess = updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution;
	assert.equal(scoutSuccess?.tone, "thinkingHigh");
	assert.deepEqual(scoutSuccess?.lines, [" /\\ /\\ ", " (^|^) ", " / V \\ "]);

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-b", isError: true });
	const researcherError = updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution;
	assert.equal(researcherError?.tone, "mdHeading");
	assert.deepEqual(researcherError?.lines, [" ,___, ", " (x,x) ", " /===\\ "]);

	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution, undefined);
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution, undefined);
});
