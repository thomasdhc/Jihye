import assert from "node:assert/strict";
import test from "node:test";

import { renderAgentProgress } from "../extensions/subagent/render.ts";
import type { AgentResult, ToolEvent } from "../extensions/subagent/types.ts";

const theme = {
	fg(_color: string, text: string): string {
		return text;
	},
	bold(text: string): string {
		return text;
	},
} as never;

function resultWithTools(agent: string, recentTools: ToolEvent[]): AgentResult {
	return {
		agent,
		task: "fixture task",
		output: "",
		exitCode: 0,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: {
			agent,
			status: "completed",
			task: "fixture task",
			recentTools,
			toolCount: recentTools.length,
			tokens: 0,
			durationMs: 1000,
			lastMessage: "",
		},
	};
}

function tool(name: string, children?: AgentResult[]): ToolEvent {
	return {
		tool: name,
		args: `${name}-args`,
		toolCallId: `${name}-id`,
		status: "done",
		children,
	};
}

function render(result: AgentResult, expanded: boolean): string {
	return renderAgentProgress(result, theme, expanded, 120).render(120).join("\n");
}

test("collapsed progress shows the latest five tool calls without mutating history", () => {
	const recentTools = Array.from({ length: 7 }, (_, index) => tool(`tool-${index + 1}`));
	const original = structuredClone(recentTools);
	const output = render(resultWithTools("fixture", recentTools), false);

	assert.match(output, /… 2 earlier tool calls/);
	assert.doesNotMatch(output, /tool-1:/);
	assert.doesNotMatch(output, /tool-2:/);
	for (let index = 3; index <= 7; index++) {
		assert.match(output, new RegExp(`tool-${index}:`));
	}
	assert.ok(output.indexOf("tool-3:") < output.indexOf("tool-7:"), "latest calls stay chronological");
	assert.deepEqual(recentTools, original);
});

test("collapsed progress does not add an omission row for five or fewer calls", () => {
	const output = render(resultWithTools("fixture", Array.from({ length: 5 }, (_, index) => tool(`tool-${index + 1}`))), false);

	assert.doesNotMatch(output, /earlier tool call/);
	for (let index = 1; index <= 5; index++) {
		assert.match(output, new RegExp(`tool-${index}:`));
	}
});

test("expanded progress shows complete tool history", () => {
	const output = render(resultWithTools("fixture", Array.from({ length: 7 }, (_, index) => tool(`tool-${index + 1}`))), true);

	assert.doesNotMatch(output, /earlier tool call/);
	for (let index = 1; index <= 7; index++) {
		assert.match(output, new RegExp(`tool-${index}:`));
	}
});

test("collapsed progress renders nested agents only for retained tool calls", () => {
	const hiddenChild = resultWithTools("hidden-child", []);
	const visibleChild = resultWithTools("visible-child", []);
	const recentTools = [
		tool("tool-1", [hiddenChild]),
		tool("tool-2"),
		tool("tool-3"),
		tool("tool-4"),
		tool("tool-5"),
		tool("tool-6", [visibleChild]),
	];

	const collapsed = render(resultWithTools("parent", recentTools), false);
	assert.doesNotMatch(collapsed, /hidden-child/);
	assert.match(collapsed, /visible-child/);

	const expanded = render(resultWithTools("parent", recentTools), true);
	assert.match(expanded, /hidden-child/);
	assert.match(expanded, /visible-child/);
});
