import assert from "node:assert/strict";
import test from "node:test";

import {
	createWidgetExtension,
	registerCompanionWidgetHost,
	renderCompanionWidgetLines,
} from "../../extensions/widget/index.ts";
import { createDefaultWidgetConfig } from "../../extensions/widget/config.ts";
import {
	COMPANION_WIDGET_UPDATE_EVENT,
	type CompanionWidgetContribution,
} from "../../extensions/widget/api.ts";

test("loads every companion component through one widget extension", () => {
	const eventHandlers: string[] = [];
	const commands: string[] = [];
	const sharedEventSubscriptions: string[] = [];

	createWidgetExtension({
		config: createDefaultWidgetConfig(),
		configPath: "/tmp/widget-test.json",
	})({
		events: {
			on(event: string) {
				sharedEventSubscriptions.push(event);
			},
			emit() {},
		},
		on(event: string) {
			eventHandlers.push(event);
		},
		registerCommand(name: string) {
			commands.push(name);
		},
	} as never);

	assert.deepEqual(sharedEventSubscriptions, [COMPANION_WIDGET_UPDATE_EVENT]);
	assert.deepEqual(commands.sort(), ["ctx", "doc-status", "review-docs", "widget"]);
	assert.equal(eventHandlers.filter((event) => event === "session_start").length, 5);
	assert.equal(eventHandlers.filter((event) => event === "session_shutdown").length, 3);
});

test("loads only widget components enabled by the widget interface", () => {
	const config = createDefaultWidgetConfig();
	config.components["doc-guardian"] = false;
	config.components["pi-pet"] = false;
	const eventHandlers: string[] = [];
	const commands: string[] = [];

	createWidgetExtension({ config, configPath: "/tmp/widget-test.json" })({
		events: { on() {}, emit() {} },
		on(event: string) {
			eventHandlers.push(event);
		},
		registerCommand(name: string) {
			commands.push(name);
		},
	} as never);

	assert.deepEqual(commands.sort(), ["ctx", "widget"]);
	assert.equal(eventHandlers.filter((event) => event === "session_start").length, 3);
	assert.equal(eventHandlers.filter((event) => event === "session_shutdown").length, 2);
	assert.equal(eventHandlers.includes("before_agent_start"), false);
	assert.equal(eventHandlers.includes("tool_execution_start"), false);
});

test("composes independent visual and detail contributions", () => {
	const contributions: CompanionWidgetContribution[] = [
		{ id: "docs", region: "details", order: 20, lines: ["docs ○"] },
		{ id: "pet", region: "visual", order: 10, lines: [" /\\_/\\", "( o.o )", " > ^ <"] },
		{ id: "context", region: "details", order: 10, lines: ["ctx 42%"] },
	];

	assert.deepEqual(renderCompanionWidgetLines(contributions, undefined, 20), [
		" /\\_/\\       ctx 42%",
		"( o.o )       docs ○",
		" > ^ <",
	]);
});

test("removing one contribution does not affect remaining components", () => {
	const contributions: CompanionWidgetContribution[] = [
		{ id: "pet", region: "visual", order: 10, lines: ["pet"] },
		{ id: "docs", region: "details", order: 20, lines: ["docs ○"] },
	];

	assert.deepEqual(renderCompanionWidgetLines(contributions), ["pet  docs ○"]);
	assert.deepEqual(renderCompanionWidgetLines(contributions.filter((item) => item.id !== "pet")), ["docs ○"]);
});

test("renders the session name below docs in Pi's accent color", () => {
	const contributions: CompanionWidgetContribution[] = [
		{ id: "session-identity", region: "details", order: 30, lines: ["Agent One"], tone: "accent" },
		{ id: "docs", region: "details", order: 20, lines: ["docs ○"], tone: "text" },
	];

	assert.deepEqual(
		renderCompanionWidgetLines(contributions, (tone, text) => `${tone}:${text}`),
		["text:docs ○", "accent:Agent One"],
	);
});

test("orders contributions without knowing component ids", () => {
	const contributions: CompanionWidgetContribution[] = [
		{ id: "later", region: "details", order: 20, lines: ["later"] },
		{ id: "earlier", region: "details", order: 10, lines: ["earlier"] },
	];

	assert.deepEqual(renderCompanionWidgetLines(contributions), ["earlier", "later"]);
});

test("preserves contributions published before the host session-start handler", async () => {
	let updateHandler: ((payload: unknown) => void) | undefined;
	let sessionStart: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
	let widgetFactory: ((tui: any, theme: any) => { render(width: number): string[] }) | undefined;

	registerCompanionWidgetHost({
		events: {
			on(_event: string, handler: (payload: unknown) => void) {
				updateHandler = handler;
			},
		},
		on(event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
			if (event === "session_start") sessionStart = handler;
		},
	} as never);

	updateHandler?.({
		id: "early",
		contribution: { id: "early", region: "details", order: 10, lines: ["published early"] },
	});
	await sessionStart?.({}, {
		mode: "tui",
		ui: {
			setWidget(_id: string, factory: typeof widgetFactory) {
				widgetFactory = factory;
			},
		},
	});

	const component = widgetFactory?.(
		{ requestRender() {} },
		{ fg(_tone: string, text: string) { return text; } },
	);
	assert.deepEqual(component?.render(80), [`${" ".repeat(65)}published early`]);
});
