import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import { analyzeSession } from "../extensions/session-observability/analyzer.ts";
import sessionObservabilityExtension from "../extensions/session-observability/index.ts";
import { OBSERVATION_OVERLAY_OPTIONS } from "../extensions/session-observability/overlay.ts";
import { formatObservationReport } from "../extensions/session-observability/render.ts";

const FIXTURE_PATH = new URL("./fixtures/session-observability.jsonl", import.meta.url);

function fixtureEntries(): SessionEntry[] {
	return readFileSync(FIXTURE_PATH, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((entry) => entry.type !== "session") as unknown as SessionEntry[];
}

function closeEnough(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test("analyzes models, tools, usage, and recursive subagents on one branch", () => {
	const report = analyzeSession(fixtureEntries(), {
		sessionId: "session-fixture",
		sessionName: "Fixture",
	});

	assert.equal(report.schemaVersion, 2);
	assert.deepEqual(
		{
			prompts: report.session.userPrompts,
			turns: report.session.assistantTurns,
			toolCalls: report.session.toolCalls,
			toolResults: report.session.toolResults,
			toolErrors: report.session.toolErrors,
			compactions: report.session.compactions,
		},
		{ prompts: 1, turns: 3, toolCalls: 5, toolResults: 5, toolErrors: 1, compactions: 1 },
	);
	assert.equal(report.session.usage.assistant.totalTokens, 255);
	assert.equal(report.session.usage.tools.totalTokens, 85);
	assert.equal(report.session.usage.summaries.totalTokens, 12);
	assert.equal(report.session.usage.observedTotal.totalTokens, 352);
	closeEnough(report.session.usage.observedTotal.cost, 0.081);

	assert.deepEqual(report.runtimes.map((runtime) => ({
		version: runtime.runtime?.jihyeVersion,
		profile: runtime.runtime?.profile,
		turns: runtime.assistantTurns,
		toolCalls: runtime.toolCalls,
		toolErrors: runtime.toolErrors,
		tokens: runtime.usage.observedTotal.totalTokens,
	})), [
		{ version: "0.2.0", profile: "standard", turns: 2, toolCalls: 5, toolErrors: 1, tokens: 317 },
		{ version: "0.2.1", profile: "standard", turns: 1, toolCalls: 0, toolErrors: 0, tokens: 35 },
	]);
	assert.deepEqual(report.turns.map((turn) => ({
		entryId: turn.entryId,
		version: turn.runtime?.jihyeVersion,
		toolCalls: turn.toolCalls,
		toolResults: turn.toolResults,
		toolErrors: turn.toolErrors,
	})), [
		{ entryId: "a1", version: "0.2.0", toolCalls: 3, toolResults: 3, toolErrors: 1 },
		{ entryId: "a2", version: "0.2.0", toolCalls: 2, toolResults: 2, toolErrors: 0 },
		{ entryId: "a3", version: "0.2.1", toolCalls: 0, toolResults: 0, toolErrors: 0 },
	]);

	assert.deepEqual(report.models.map(({ provider, model, turns }) => ({ provider, model, turns })), [
		{ provider: "openai-codex", model: "gpt-test", turns: 3 },
	]);
	assert.deepEqual(report.tools.map((tool) => ({
		name: tool.name,
		calls: tool.calls,
		results: tool.results,
		errors: tool.errors,
		truncated: tool.truncatedResults,
	})), [
		{ name: "bash", calls: 2, results: 2, errors: 1, truncated: 0 },
		{ name: "read", calls: 2, results: 2, errors: 0, truncated: 1 },
		{ name: "subagent", calls: 1, results: 1, errors: 0, truncated: 0 },
	]);

	assert.equal(report.maxSubagentDepth, 2);
	assert.deepEqual(report.subagents.map((subagent) => ({
		agent: subagent.agent,
		calls: subagent.calls,
		tools: subagent.toolCalls,
		depth: subagent.maxDepth,
		tokens: subagent.usage.totalTokens,
		models: subagent.models,
	})), [
		{ agent: "reviewer", calls: 1, tools: 1, depth: 2, tokens: 25, models: ["anthropic/claude-test"] },
		{ agent: "scout", calls: 1, tools: 2, depth: 1, tokens: 60, models: ["openai-codex/gpt-test"] },
	]);
	assert.deepEqual(report.signals.map(({ kind, confidence, tool, toolCallIds }) => ({
		kind,
		confidence,
		tool,
		toolCallIds,
	})), [
		{ kind: "tool-error", confidence: "fact", tool: "bash", toolCallIds: ["bash-1"] },
		{ kind: "truncated-tool-result", confidence: "fact", tool: "read", toolCallIds: ["read-2"] },
		{ kind: "repeated-after-error", confidence: "heuristic", tool: "bash", toolCallIds: ["bash-1", "bash-2"] },
	]);
});

test("prefers declared tool usage over the subagent-detail fallback", () => {
	const entries = fixtureEntries();
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "toolResult" || entry.message.toolName !== "subagent") continue;
		entry.message.usage = {
			input: 5,
			output: 2,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 7,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.04 },
		};
	}

	const report = analyzeSession(entries);
	assert.equal(report.session.usage.tools.totalTokens, 7);
	closeEnough(report.session.usage.tools.cost, 0.04);
	assert.equal(report.subagents.reduce((total, item) => total + item.usage.totalTokens, 0), 85);
});

test("keeps prompts, arguments, tasks, and outputs out of normalized observations", () => {
	const serialized = JSON.stringify(analyzeSession(fixtureEntries()));

	for (const secret of ["private user request", "private-command", "secret.ts", "private scout task", "private final answer"]) {
		assert.equal(serialized.includes(secret), false, secret);
	}
});

test("keeps turns before the first runtime marker unattributed", () => {
	const entries = fixtureEntries().filter((entry) => entry.type !== "custom");
	const report = analyzeSession(entries);

	assert.equal(report.runtimes.length, 1);
	assert.equal(report.runtimes[0]?.runtime, undefined);
	assert.ok(report.turns.every((turn) => turn.runtime === undefined));
});

test("ignores malformed runtime markers and accepts additive future marker schemas", () => {
	const entries = fixtureEntries();
	const firstMarker = entries.findIndex((entry) => entry.type === "custom");
	entries.splice(firstMarker + 1, 0, {
		type: "custom",
		id: "malformed-runtime",
		parentId: "j1",
		timestamp: "2026-01-01T00:00:00.750Z",
		customType: "jihye-runtime",
		data: { schemaVersion: 1 },
	} as unknown as SessionEntry);
	const futureMarker = entries.find((entry) => entry.type === "custom" && entry.id === "j2");
	if (futureMarker?.type === "custom") {
		futureMarker.data = { ...(futureMarker.data as Record<string, unknown>), schemaVersion: 2 };
	}

	const report = analyzeSession(entries);
	assert.deepEqual(report.turns.map((turn) => turn.runtime?.jihyeVersion), ["0.2.0", "0.2.0", "0.2.1"]);
	assert.equal(report.turns[2]?.runtime?.schemaVersion, 2);
});

test("reports missing and orphan tool results without guessing at intent", () => {
	const entries = [
		{
			type: "message",
			id: "assistant",
			parentId: null,
			timestamp: "2026-01-01T00:00:00.000Z",
			message: {
				role: "assistant",
				provider: "test",
				model: "test",
				usage: {},
				content: [{ type: "toolCall", id: "missing", name: "read", arguments: { path: "private" } }],
			},
		},
		{
			type: "message",
			id: "result",
			parentId: "assistant",
			timestamp: "2026-01-01T00:00:01.000Z",
			message: {
				role: "toolResult",
				toolCallId: "orphan",
				toolName: "bash",
				content: [],
				isError: false,
			},
		},
	] as unknown as SessionEntry[];

	const report = analyzeSession(entries);
	assert.deepEqual(report.signals.map((item) => item.kind), ["missing-tool-result", "orphan-tool-result"]);
	assert.equal(report.tools.find((tool) => tool.name === "read")?.missingResults, 1);
	assert.equal(report.tools.find((tool) => tool.name === "bash")?.orphanResults, 1);
});

test("formats a concise report with evidence labels and coverage limits", () => {
	const text = formatObservationReport(analyzeSession(fixtureEntries(), {
		sessionId: "session-fixture",
		sessionName: "Fixture",
	}));

	assert.match(text, /^Jihye session observation/m);
	assert.match(text, /1 prompt · 3 assistant turns · 5 tool calls/);
	assert.match(text, /1 compaction · 0 model changes · 0 thinking-level changes/);
	assert.match(text, /352 tokens · \$0\.0810 observed/);
	assert.match(text, /Jihye 0\.2\.0 · Pi 0\.83\.0 · standard · 2 assistant turns/);
	assert.match(text, /Jihye 0\.2\.1 · Pi 0\.83\.0 · standard · 1 assistant turn/);
	assert.match(text, /Subagents · max depth 2/);
	assert.match(text, /FACT · 1 tool error · bash \(bash-1\)/);
	assert.match(text, /HEURISTIC · 1 repeated after error · bash \(bash-1, bash-2\)/);
	assert.match(text, /runtime attribution from Jihye markers/);
	assert.match(text, /parent tool timing unavailable/);
});

test("opens a bordered overlay after waiting for idle and analyzing the active branch", async () => {
	type Command = { handler(args: string, ctx: any): Promise<void> };
	let commandName = "";
	let command: Command | undefined;
	sessionObservabilityExtension({
		registerCommand(name: string, registered: Command) {
			commandName = name;
			command = registered;
		},
	} as never);

	const order: string[] = [];
	let rendered: string[] = [];
	let scrolled: string[] = [];
	let closes = 0;
	let renderRequests = 0;
	let customOptions: unknown;
	await command?.handler("", {
		mode: "tui",
		waitForIdle: async () => { order.push("idle"); },
		sessionManager: {
			getBranch() {
				order.push("branch");
				return fixtureEntries();
			},
			getSessionId: () => "session-fixture",
			getSessionName: () => "Fixture",
		},
		ui: {
			notify() {
				assert.fail("unexpected notification");
			},
			async custom(factory: any, options: unknown) {
				customOptions = options;
				const component = factory({
					terminal: { rows: 12 },
					requestRender() { renderRequests += 1; },
				}, {
					fg(_color: string, text: string) { return text; },
				}, {}, () => { closes += 1; });
				rendered = component.render(80);
				component.handleInput("\u001b");
				component.handleInput("\u0003");
				component.handleInput("\u001b[B");
				scrolled = component.render(80);
			},
		},
	});

	assert.equal(commandName, "jihye-observe");
	assert.deepEqual(order, ["idle", "branch"]);
	assert.deepEqual(customOptions, {
		overlay: true,
		overlayOptions: OBSERVATION_OVERLAY_OPTIONS,
	});
	assert.equal(closes, 2, "both Escape and Ctrl+C close the report");
	assert.equal(renderRequests, 1, "scroll input rerenders the overlay");
	assert.notDeepEqual(scrolled, rendered, "Down scrolls a report longer than the overlay");
	assert.match(rendered.join("\n"), /Jihye session observation/);
	assert.match(rendered[0] ?? "", /^╭─+╮$/);
	assert.match(rendered.at(-1) ?? "", /^╰─+╯$/);
	assert.ok(rendered.every((line) => visibleWidth(line) === 80), "every overlay row fits its box");
});

test("rejects unsupported arguments before inspecting the session", async () => {
	type Command = { handler(args: string, ctx: any): Promise<void> };
	let command: Command | undefined;
	sessionObservabilityExtension({
		registerCommand(_name: string, registered: Command) {
			command = registered;
		},
	} as never);

	const notifications: Array<[string, string]> = [];
	await command?.handler("tools", {
		mode: "tui",
		waitForIdle: async () => assert.fail("must not wait"),
		sessionManager: { getBranch: () => assert.fail("must not inspect") },
		ui: { notify: (message: string, level: string) => notifications.push([message, level]) },
	});

	assert.deepEqual(notifications, [["Usage: /jihye-observe", "warning"]]);
});

test("does not analyze or write anything outside interactive mode", async () => {
	type Command = { handler(args: string, ctx: any): Promise<void> };
	let command: Command | undefined;
	sessionObservabilityExtension({
		registerCommand(_name: string, registered: Command) {
			command = registered;
		},
	} as never);

	const notifications: Array<[string, string]> = [];
	await command?.handler("", {
		mode: "json",
		waitForIdle: async () => assert.fail("must not wait"),
		sessionManager: { getBranch: () => assert.fail("must not inspect") },
		ui: { notify: (message: string, level: string) => notifications.push([message, level]) },
	});

	assert.deepEqual(notifications, [["/jihye-observe requires interactive mode", "error"]]);
});
