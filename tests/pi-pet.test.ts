import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiPetEvent,
	createPiPetExtension,
	createPiPetRuntimeState,
	normalizePetState,
	renderPiPetLines,
} from "../extensions/pi-pet.ts";
import { CONTEXT_STATUS_EVENT } from "../extensions/context-status.ts";
import { DOC_GUARDIAN_STATUS_EVENT } from "../extensions/doc-guardian.ts";

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

test("renders message next to the pet art without a state label", () => {
	const runtime = createPiPetRuntimeState();
	assert.deepEqual(renderPiPetLines(runtime), [" /\\_/\\      ready when you are", "( o.o )", " > ^ <"]);
});

test("renders shared status and message as a fixed-distance right column", () => {
	const runtime = createPiPetRuntimeState();
	runtime.contextStatus = "ctx [████░░░░░░] 42% (115k/272k)";
	runtime.docStatus = "docs ○";
	assert.deepEqual(renderPiPetLines(runtime), [
		" /\\_/\\      ctx [████░░░░░░] 42% (115k/272k)",
		"( o.o )     docs ○",
		" > ^ <      ready when you are",
	]);
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
	const notifications: string[] = [];
	const ctx: FakeContext = {
		hasUI: true,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setWidget(_id: string, value: unknown) {
				widgets.push(value);
			},
		},
	};

	const eventBus = new Map<string, (payload: unknown) => void>();
	createPiPetExtension({ resetToIdleMs: 1 })({
		events: {
			on(event: string, handler: (payload: unknown) => void) {
				eventBus.set(event, handler);
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
	eventBus.get(CONTEXT_STATUS_EVENT)?.({ label: "ctx [████░░░░░░] 42% (115k/272k)" });
	eventBus.get(DOC_GUARDIAN_STATUS_EVENT)?.({ label: "docs ○" });
	await handlers.get("session_start")?.({}, ctx);
	assert.equal(typeof widgets.at(-1), "function");

	await commandHandler("react error", ctx);
	assert.match(notifications.at(-1) ?? "", /error/);

	await commandHandler("hide", ctx);
	assert.equal(widgets.at(-1), undefined);
});

interface FakeContext {
	hasUI: boolean;
	ui: {
		notify(message: string, level?: string): void;
		setStatus?(id: string, value: string | undefined): void;
		setWidget(id: string, value: unknown, options?: unknown): void;
	};
}
