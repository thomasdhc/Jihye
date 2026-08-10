import assert from "node:assert/strict";
import test from "node:test";

import {
	emitSubagentProgress,
	getSubagentProgressPhase,
	isSubagentProgressEvent,
	SUBAGENT_PROGRESS_EVENT,
} from "../extensions/subagent/progress-events.ts";
import type { AgentProgress, ToolEvent } from "../extensions/subagent/types.ts";

function progressWithTools(recentTools: ToolEvent[]): AgentProgress {
	return {
		agent: "fixture",
		status: "running",
		task: "private delegated task",
		recentTools,
		toolCount: recentTools.length,
		tokens: 123,
		durationMs: 456,
		lastMessage: "private child output",
	};
}

test("derives working while any concurrent child tool is running", () => {
	const progress = progressWithTools([
		{ tool: "read", args: "private/path", toolCallId: "child-a", status: "running" },
		{ tool: "grep", args: "private pattern", toolCallId: "child-b", status: "done" },
	]);

	assert.equal(getSubagentProgressPhase(progress), "working");
	progress.recentTools[0]!.status = "done";
	assert.equal(getSubagentProgressPhase(progress), "thinking");
	progress.recentTools.push({ tool: "subagent", args: "nested", toolCallId: "child-c", status: "running" });
	assert.equal(getSubagentProgressPhase(progress), "working", "nested agents remain activity of the top-level call");
});

test("emits only top-level correlation ID and derived phase for concurrent calls", () => {
	const emitted: Array<{ event: string; payload: unknown }> = [];
	const events = {
		emit(event: string, payload: unknown) {
			emitted.push({ event, payload });
		},
	};

	emitSubagentProgress(events, "parent-a", progressWithTools([]));
	emitSubagentProgress(events, "parent-b", progressWithTools([
		{ tool: "bash", args: "secret command", toolCallId: "child-tool", status: "running" },
	]));

	assert.deepEqual(emitted, [
		{ event: SUBAGENT_PROGRESS_EVENT, payload: { toolCallId: "parent-a", phase: "thinking" } },
		{ event: SUBAGENT_PROGRESS_EVENT, payload: { toolCallId: "parent-b", phase: "working" } },
	]);
	for (const { payload } of emitted) {
		assert.deepEqual(Object.keys(payload as object).sort(), ["phase", "toolCallId"]);
		assert.equal(isSubagentProgressEvent(payload), true);
	}
});

test("rejects malformed progress payloads", () => {
	assert.equal(isSubagentProgressEvent(undefined), false);
	assert.equal(isSubagentProgressEvent({ toolCallId: "", phase: "thinking" }), false);
	assert.equal(isSubagentProgressEvent({ toolCallId: "parent", phase: "success" }), false);
});
