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

test("identifies destructive segments within command chains", () => {
	const cases = [
		["source .venv/bin/activate && printf 'safe'; rm -rf 'tmp dir'; git status", ["rm -rf 'tmp dir'"]],
		["echo data > /etc/example && git status --short", ["echo data > /etc/example"]],
	] as const;

	for (const [command, expectedCommands] of cases) {
		const risk = analyzeBashCommand(command);
		assert.ok(risk, command);
		assert.deepEqual(risk.flaggedCommands, expectedCommands, command);
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

test("highlights the destructive segment in the approval prompt", async () => {
	type ToolCallHandler = (
		event: { type: "tool_call"; toolCallId: string; toolName: "bash"; input: { command: string } },
		ctx: never,
	) => Promise<{ block?: boolean; reason?: string } | undefined>;
	type PromptFactory = (
		tui: { requestRender(): void },
		theme: {
			fg(color: string, text: string): string;
			bold(text: string): string;
		},
		keybindings: object,
		done: (choice: "run" | "abort") => void,
	) => { render(width: number): string[] };

	let handler: ToolCallHandler | undefined;
	bashGuard({
		registerFlag() {},
		on(event: string, callback: ToolCallHandler) {
			if (event === "tool_call") handler = callback;
		},
	} as never);

	assert.ok(handler);
	let rendered = "";
	const command = "printf safe && rm -rf tmp && git status --short";
	const result = await handler(
		{ type: "tool_call", toolCallId: "test-call", toolName: "bash", input: { command } },
		{
			hasUI: true,
			ui: {
				async custom(factory: PromptFactory) {
					const component = factory(
						{ requestRender() {} },
						{
							fg: (color, text) => `<${color}>${text}</${color}>`,
							bold: (text) => `<bold>${text}</bold>`,
						},
						{},
						() => {},
					);
					rendered = component.render(240).join("\n");
					return "abort" as const;
				},
			},
		} as never,
	);

	assert.equal(result?.block, true);
	assert.match(rendered, /<error><bold>⚠ rm -rf tmp<\/bold><\/error>/);
	assert.doesNotMatch(rendered, /<error><bold>⚠ printf safe/);
	assert.match(rendered, /Full command:/);
	assert.match(rendered, /printf safe && rm -rf tmp && git status --short/);
});
