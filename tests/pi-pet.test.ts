import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	normalizePetState,
	renderPiPetLines,
} from "../extensions/pi-pet.ts";

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

test("renders no widget lines when hidden", () => {
	const runtime = createPiPetRuntimeState();
	runtime.visible = false;
	assert.deepEqual(renderPiPetLines(runtime), []);
});

test("registers pet command and updates the widget", async () => {
	type Handler = (event: unknown, ctx: FakeContext) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	let commandHandler: ((args: string, ctx: FakeContext) => Promise<void>) | undefined;
	const widgets: unknown[] = [];
	const statuses: Array<string | undefined> = [];
	const notifications: string[] = [];
	const ctx: FakeContext = {
		hasUI: true,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setStatus(_id: string, value: string | undefined) {
				statuses.push(value);
			},
			setWidget(_id: string, value: unknown) {
				widgets.push(value);
			},
		},
	};

	createPiPetExtension({ resetToIdleMs: 1 })({
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
	assert.equal(statuses.at(-1), "π-pet: idle");
	assert.equal(typeof widgets.at(-1), "function");

	await commandHandler("react error", ctx);
	assert.equal(statuses.at(-1), "π-pet: error");
	assert.match(notifications.at(-1) ?? "", /error/);

	await commandHandler("hide", ctx);
	assert.equal(statuses.at(-1), undefined);
	assert.equal(widgets.at(-1), undefined);
});

interface FakeContext {
	hasUI: boolean;
	ui: {
		notify(message: string, level?: string): void;
		setStatus(id: string, value: string | undefined): void;
		setWidget(id: string, value: unknown, options?: unknown): void;
	};
}
