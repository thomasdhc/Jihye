import assert from "node:assert/strict";
import test from "node:test";

import bashGuard, { analyzeBashCommand } from "../extensions/bash-guard/index.ts";

test("detects destructive filesystem commands", () => {
	const cases = [
		["rm file.txt", "rm (file deletion)"],
		["rmdir empty-dir", "rmdir (file deletion)"],
		["unlink symlink", "unlink (file deletion)"],
		["find . -delete", "find -delete (bulk deletion)"],
		["printf 'done'; rm file.txt", "rm (file deletion)"],
	] as const;

	for (const [command, expectedReason] of cases) {
		const risk = analyzeBashCommand(command);
		assert.ok(risk, command);
		assert.equal(risk.severity, "high", command);
		assert.ok(risk.reasons.includes(expectedReason), command);
	}
});

test("allows commands outside the guard rules", () => {
	const commands = [
		"ls -la",
		"find . -type f -print",
		"git status --short",
		'echo "rm file.txt"',
		'printf "%s\\n" unlink',
	];

	for (const command of commands) {
		assert.equal(analyzeBashCommand(command), null, command);
	}
});

test("blocks guarded commands when manual approval is unavailable", async () => {
	type ToolCallHandler = (
		event: { type: "tool_call"; toolCallId: string; toolName: "bash"; input: { command: string } },
		ctx: { hasUI: boolean },
	) => Promise<{ block?: boolean; reason?: string } | undefined>;

	let handler: ToolCallHandler | undefined;
	bashGuard({
		registerFlag() {},
		getFlag() {
			return false;
		},
		on(event: string, callback: ToolCallHandler) {
			if (event === "tool_call") handler = callback;
		},
	} as never);

	assert.ok(handler);
	const result = await handler(
		{
			type: "tool_call",
			toolCallId: "test-call",
			toolName: "bash",
			input: { command: "rm file.txt" },
		},
		{ hasUI: false },
	);

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /Blocked by user via bash-guard/);
});
