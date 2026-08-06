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
	assert.equal(updates.at(-1)?.contribution?.tone, "syntaxString");

	await handlers.get("tool_execution_end")?.({ isError: true });
	assert.equal(updates.at(-1)?.contribution?.tone, "error");

	await handlers.get("session_start")?.({});
	await handlers.get("agent_settled")?.({});
	assert.equal(updates.at(-1)?.contribution?.tone, "thinkingHigh");
	assert.ok(updates.every((update) => update.id === "pi-pet:art"));
});
