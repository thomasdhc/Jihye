import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	getPiPetResetDelay,
	renderPiPetLines,
} from "../extensions/pi-pet.ts";
import { COMPANION_WIDGET_UPDATE_EVENT, type CompanionWidgetUpdate } from "../lib/companion-widget.ts";

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

test("tracks top-level subagent pets independently", () => {
	const runtime = createPiPetRuntimeState();

	applyPiPetEvent(runtime, "tool_execution_start", { toolName: "subagent", toolCallId: "a" });
	applyPiPetEvent(runtime, "tool_execution_start", { toolName: "subagent", toolCallId: "b" });
	assert.equal(runtime.subagentPets.get("a")?.state, "working");
	assert.equal(runtime.subagentPets.get("b")?.state, "working");
	assert.notEqual(runtime.subagentPets.get("a")?.order, runtime.subagentPets.get("b")?.order);

	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "a" });
	applyPiPetEvent(runtime, "tool_execution_end", { toolName: "subagent", toolCallId: "b", isError: true });
	assert.equal(runtime.subagentPets.get("a")?.state, "success");
	assert.equal(runtime.subagentPets.get("b")?.state, "error");
});

test("renders persistent pet-owned artwork without status text", () => {
	const runtime = createPiPetRuntimeState();
	assert.deepEqual(renderPiPetLines(runtime), [" /\\_/\\", "( o.o )", " > ^ <"]);
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

test("publishes and removes independent top-level subagent pet contributions", async () => {
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

	await handlers.get("tool_execution_start")?.({ toolName: "subagent", toolCallId: "subagent-a" });
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-a");
	assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");

	await handlers.get("tool_execution_start")?.({ toolName: "subagent", toolCallId: "subagent-b" });
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-b");
	assert.equal(updates.at(-1)?.contribution?.tone, "mdLink");
	assert.notEqual(
		updates.find((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution?.order,
		updates.find((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution?.order,
	);

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-a" });
	assert.equal(updates.at(-1)?.id, "pi-pet:subagent:subagent-b");
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution?.tone, "thinkingHigh");

	await handlers.get("tool_execution_end")?.({ toolName: "subagent", toolCallId: "subagent-b", isError: true });
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution?.tone, "mdHeading");

	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-a")?.contribution, undefined);
	assert.equal(updates.findLast((update) => update.id === "pi-pet:subagent:subagent-b")?.contribution, undefined);
});
