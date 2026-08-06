import assert from "node:assert/strict";
import test from "node:test";

import companionWidgetExtension, { renderCompanionWidgetLines } from "../extensions/companion-widget.ts";
import type { CompanionWidgetContribution } from "../lib/companion-widget.ts";

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

	companionWidgetExtension({
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
