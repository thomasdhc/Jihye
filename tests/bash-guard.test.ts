import assert from "node:assert/strict";
import test from "node:test";

import bashGuard, { analyzeBashCommand, analyzeGitHubCliCommand } from "../extensions/bash-guard/index.ts";
import { TERMINAL_NOTIFY_EVENT } from "../extensions/terminal-notify.ts";

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

test("detects dangerous GitHub CLI operations", () => {
	const commands = [
		"gh repo delete owner/repo --yes",
		"gh repo archive owner/repo --yes",
		"gh repo rename new-name --yes",
		"gh repo edit owner/repo --visibility=private",
		"gh repo sync owner/fork --force",
		"gh repo deploy-key add key.pub",
		"gh repo deploy-key delete 123",
		"gh repo autolink delete 123",
		"gh pr merge 42 --squash",
		"gh pr -R owner/repo merge 42",
		"gh pr close 42",
		"gh pr revert 42",
		"gh issue close 42",
		"gh issue delete 42 --yes",
		"gh issue transfer 42 owner/other-repo",
		"gh release delete v1.0.0 --yes",
		"gh release delete-asset v1.0.0 artifact.tgz --yes",
		"gh workflow disable ci.yml",
		"gh workflow run deploy.yml",
		"gh run cancel 123",
		"gh run delete 123",
		"gh run rerun 123",
		"gh cache delete --all",
		"gh secret set TOKEN",
		"gh secret delete TOKEN",
		"gh variable set DEPLOY_ENV --body prod",
		"gh variable delete DEPLOY_ENV",
		"gh ssh-key add key.pub",
		"gh ssh-key delete 123",
		"gh gpg-key add key.gpg",
		"gh gpg-key delete ABC123",
		"gh project close 1 --owner owner",
		"gh project delete 1 --owner owner",
		"gh project field-delete --id FIELD_ID",
		"gh project item-archive 1 --id ITEM_ID --owner owner",
		"gh project item-delete 1 --id ITEM_ID --owner owner",
		"gh gist delete abc123",
		"gh codespace delete --codespace example",
		"gh label delete obsolete --yes",
		"gh api -XDELETE repos/owner/repo",
		"gh api --method PATCH repos/owner/repo -f archived=true",
		"gh api repos/owner/repo/issues -f title=example",
		"gh api graphql -f 'query=mutation { deleteProjectV2(input: {}) { clientMutationId } }'",
		"gh api graphql --input request.json",
		"GH_HOST=github.com gh repo delete owner/repo --yes",
		"command gh pr merge 42",
		"env GH_HOST=github.com gh issue delete 42 --yes",
		"printf ready | gh workflow run deploy.yml",
		"echo $(gh run cancel 123)",
	] as const;

	for (const command of commands) {
		const risk = analyzeBashCommand(command);
		assert.ok(risk, command);
		assert.ok(risk.reasons.some((reason) => reason.startsWith("gh ")), command);
		assert.ok(analyzeGitHubCliCommand(command), `headless policy: ${command}`);
	}
});

test("allows non-dangerous GitHub CLI operations", () => {
	const commands = [
		"gh auth status",
		"gh repo view owner/repo",
		"gh repo edit owner/repo --description example",
		"gh repo sync owner/fork",
		"gh pr merge 42 --disable-auto",
		"gh pr comment 42 --body looks-good",
		"gh issue create --title example --body details",
		"gh release download v1.0.0",
		"gh workflow view ci.yml",
		"gh run view 123 --log",
		"gh secret list",
		"gh api repos/owner/repo",
		"gh api --method GET repos/owner/repo/issues -f per_page=100",
		"gh api graphql -f 'query=query { viewer { login } }'",
		"gh api graphql -f query=@literal-value",
		"echo 'gh repo delete owner/repo'",
	] as const;

	for (const command of commands) {
		assert.equal(analyzeBashCommand(command), null, command);
		assert.equal(analyzeGitHubCliCommand(command), null, `headless policy: ${command}`);
	}
});

test("identifies destructive segments within command chains", () => {
	const cases = [
		["source .venv/bin/activate && printf 'safe'; rm -rf 'tmp dir'; git status", ["rm -rf 'tmp dir'"]],
		["echo data > /etc/example && git status --short", ["echo data > /etc/example"]],
		["gh repo view owner/repo && gh repo delete owner/repo --yes; gh status", ["gh repo delete owner/repo --yes"]],
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

test("requests a terminal alert before showing an approval prompt", async () => {
	type ToolCallHandler = (
		event: { type: "tool_call"; toolCallId: string; toolName: "bash"; input: { command: string } },
		ctx: never,
	) => Promise<{ block?: boolean; reason?: string } | undefined>;

	let handler: ToolCallHandler | undefined;
	let emittedEvent = "";
	let emittedData: unknown;
	bashGuard({
		registerFlag() {},
		on(event: string, callback: ToolCallHandler) {
			if (event === "tool_call") handler = callback;
		},
		events: {
			emit(event: string, data: unknown) {
				emittedEvent = event;
				emittedData = data;
			},
		},
	} as never);

	assert.ok(handler);
	await handler(
		{ type: "tool_call", toolCallId: "test-call", toolName: "bash", input: { command: "rm file.txt" } },
		{
			hasUI: true,
			mode: "tui",
			ui: {
				async custom() {
					return "abort" as const;
				},
			},
		} as never,
	);

	assert.equal(emittedEvent, TERMINAL_NOTIFY_EVENT);
	assert.deepEqual(emittedData, {
		mode: "tui",
		title: "Pi",
		body: "Bash approval required (high risk)",
		ringBell: true,
	});
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
