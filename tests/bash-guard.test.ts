import assert from "node:assert/strict";
import test from "node:test";

import bashGuard, { detectDestructiveCommand } from "../extensions/bash-guard.ts";

test("detects the guarded destructive commands", () => {
	const cases = [
		["rm file.txt", "rm"],
		["rm -rf tmp/", "rm"],
		["/bin/rm file.txt", "rm"],
		["sudo -n rm file.txt", "rm"],
		["env LC_ALL=C unlink link", "unlink"],
		["rmdir empty-dir", "rmdir"],
		["find . -delete", "find -delete"],
		["find . -exec rm {} +", "rm"],
		["printf x; rm file.txt", "rm"],
		["echo ok | xargs rm", "rm"],
		["if test -e x; then rm x; fi", "rm"],
		["echo $(rm file.txt)", "rm"],
	] as const;

	for (const [command, expected] of cases) {
		assert.equal(detectDestructiveCommand(command)?.command, expected, command);
	}
});

test("allows commands outside the narrow guard scope", () => {
	const commands = [
		"ls -la",
		"find . -type f -print",
		"git status --short",
		'echo "rm file.txt"',
		'printf "%s\\n" unlink',
		"# rm ignored.txt\nls",
	];

	for (const command of commands) {
		assert.equal(detectDestructiveCommand(command), undefined, command);
	}
});

test("prompts for guarded Bash tool calls and honors the decision", async () => {
	type ToolCallHandler = (event: unknown, ctx: unknown) => Promise<{ block: true; reason: string } | undefined>;
	let handler: ToolCallHandler | undefined;

	bashGuard({
		on(event: string, callback: ToolCallHandler) {
			if (event === "tool_call") handler = callback;
		},
	} as never);

	assert.ok(handler);

	let promptCount = 0;
	const context = (approved: boolean, hasUI = true) => ({
		cwd: "/tmp/project",
		hasUI,
		ui: {
			async confirm() {
				promptCount += 1;
				return approved;
			},
		},
	});
	const event = (command: string) => ({ toolName: "bash", input: { command } });

	assert.equal(await handler(event("ls"), context(false)), undefined);
	assert.equal(promptCount, 0);

	assert.equal(await handler(event("rm file"), context(true)), undefined);
	assert.equal(promptCount, 1);

	assert.equal((await handler(event("unlink file"), context(false)))?.block, true);
	assert.equal((await handler(event("find . -delete"), context(false, false)))?.block, true);
});
