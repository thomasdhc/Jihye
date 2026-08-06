import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	normalizePetState,
	renderPiPetLines,
} from "../extensions/pi-pet.ts";
import { COMPANION_WIDGET_UPDATE_EVENT, type CompanionWidgetUpdate } from "../lib/companion-widget.ts";

test("normalizes supported pi pet states", () => {
	assert.equal(normalizePetState("idle"), "idle");
	assert.equal(normalizePetState(" Working "), "working");
	assert.equal(normalizePetState("nope"), undefined);
});

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

test("renders only pet-owned artwork", () => {
	const runtime = createPiPetRuntimeState();
	assert.deepEqual(renderPiPetLines(runtime), [" /\\_/\\", "( o.o )", " > ^ <"]);
});

test("renders no pet artwork when hidden", () => {
	const runtime = createPiPetRuntimeState();
	runtime.visible = false;
	assert.deepEqual(renderPiPetLines(runtime), []);
});

test("publishes pet-owned contributions and commands without owning the widget", async () => {
	type Handler = (event: unknown, ctx: FakeContext) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	let commandHandler: ((args: string, ctx: FakeContext) => Promise<void>) | undefined;
	const updates: CompanionWidgetUpdate[] = [];
	const notifications: string[] = [];
	const ctx: FakeContext = {
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
		},
	};

	createPiPetExtension({ resetToIdleMs: 1 })({
		events: {
			emit(event: string, payload: CompanionWidgetUpdate) {
				assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
				updates.push(payload);
			},
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, command: { handler: (args: string, ctx: FakeContext) => Promise<void> }) {
			assert.equal(name, "pet");
			commandHandler = command.handler;
		},
	} as never);

	assert.ok(commandHandler);
	await handlers.get("session_start")?.({}, ctx);
	assert.deepEqual(
		updates.slice(-2).map((update) => update.id),
		["pi-pet:art", "pi-pet:status"],
	);

	await commandHandler("react error", ctx);
	assert.match(notifications.at(-1) ?? "", /error/);
	assert.equal(updates.at(-1)?.contribution?.tone, "error");

	await commandHandler("hide", ctx);
	assert.deepEqual(
		updates.slice(-2).map((update) => update.id),
		["pi-pet:art", "pi-pet:status"],
	);
	assert.ok(updates.slice(-2).every((update) => update.contribution === undefined));
});

interface FakeContext {
	ui: {
		notify(message: string, level?: string): void;
	};
}
