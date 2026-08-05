import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import bashGuard, {
	analyzeBashCommand,
	analyzeGitHubCliCommand,
	analyzeGitLabCliCommand,
} from "../extensions/bash-guard/index.ts";
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
		"gh pr merge 42 --disable-auto=false",
		"gh pr merge 42 --disable-auto=true --disable-auto=false",
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
		'gh api graphql -f "query=$(cat request.graphql)"',
		'gh api graphql -f "query=$GRAPHQL_DOCUMENT"',
		"gh --hostname github.com api -X DELETE repos/owner/repo",
		"GH_HOST=github.com gh repo delete owner/repo --yes",
		"command gh pr merge 42",
		"env GH_HOST=github.com gh issue delete 42 --yes",
		"printf ready | gh workflow run deploy.yml",
		"echo $(gh run cancel 123)",
		'gh pr "$(printf merge)" 42',
		'action=merge; gh pr "$action" 42',
	] as const;

	for (const command of commands) {
		const risk = analyzeBashCommand(command);
		assert.ok(risk, command);
		assert.ok(risk.reasons.some((reason) => reason.startsWith("gh ")), command);
		assert.ok(analyzeGitHubCliCommand(command), `headless policy: ${command}`);
	}
});

test("detects dangerous GitLab CLI operations", () => {
	const commands = [
		"glab repo delete example/project --yes",
		"glab repo transfer example/project --to-group other",
		"glab repo mirror example/project --url https://example.com/mirror.git",
		"glab repo update example/project --archive=true",
		"glab repo update example/project --defaultBranch trunk",
		"glab repo members add --username user --access-level developer",
		"glab repo members remove --username user",
		"glab repo publish catalog v1.0.0",
		"glab mr merge 42 --squash",
		"glab mr -R example/project accept 42",
		"glab mr close 42",
		"glab mr delete 42",
		"glab mr del 42",
		"glab mr rebase 42",
		"glab mr note delete 10 42",
		"glab issue close 42",
		"glab issue delete 42",
		"glab issue del 42",
		"glab incident close 42",
		"glab work-items delete 42",
		"glab release delete v1.0.0",
		"glab ci cancel pipeline 123",
		"glab ci cancel pipeline 123 --dry-run=false",
		"glab ci delete 123",
		"glab ci delete 123 --dry-run=false",
		"glab ci delete 123 --dry-run=true --dry-run=false",
		"glab ci run --branch main",
		"glab ci run --web=false",
		"glab ci run --web=true --web=false",
		"glab ci run-trig --token token --branch main",
		"glab ci retry lint",
		"glab ci trigger deploy",
		"glab pipeline retry lint",
		"glab pipe trigger deploy",
		"glab schedule create --cron '0 0 * * *' --ref main",
		"glab schedule delete 10",
		"glab schedule update 10 --active=false",
		"glab schedule update 10 --update-variable DEPLOY_ENV:prod",
		"glab schedule run 10",
		"glab variable set DEPLOY_ENV prod",
		"glab variable update DEPLOY_ENV prod",
		"glab variable delete DEPLOY_ENV",
		"glab deploy-key add key.pub",
		"glab deploy-key delete 123",
		"glab ssh-key add key.pub",
		"glab ssh-key delete 123",
		"glab gpg-key add key.gpg",
		"glab gpg-key delete ABC123",
		"glab token create deploy-token",
		"glab token revoke deploy-token",
		"glab token rm deploy-token",
		"glab token rotate deploy-token",
		"glab securefile create config config.bin",
		"glab securefile upload config config.bin",
		"glab securefile remove 123",
		"glab securefile rm 123",
		"glab label delete obsolete",
		"glab milestone delete 123",
		"glab runner assign 123 --repo example/project",
		"glab runner unassign 123 --repo example/project",
		"glab runner delete 123 --force",
		"glab runner update 123 --pause",
		"glab cluster agent bootstrap production",
		"glab cluster agent get-token --agent 123",
		"glab cluster agent token revoke 123 456",
		"glab cluster agent token-cache clear",
		"glab opentofu state delete production",
		"glab runner-controller create --state enabled",
		"glab runner-controller delete 123",
		"glab runner-controller update 123 --state disabled",
		"glab runner-controller scope create 123 --project-id 456",
		"glab runner-controller scope delete 123 --project-id 456",
		"glab runner-controller token create 123",
		"glab runner-controller token revoke 123 456",
		"glab runner-controller token rotate 123 456",
		"glab changelog generate --version v1.0.0",
		"glab api -XDELETE projects/123",
		"glab api --method PATCH projects/123 -f archived=true",
		"glab api projects/123/pipeline -f ref=main",
		"glab api projects/123/uploads --form file=@artifact.txt",
		"glab api graphql -f 'query=mutation { issueDelete(input: {}) { errors } }'",
		"glab api graphql --input request.json",
		'glab api graphql -f "query=$(cat request.graphql)"',
		'glab api graphql -f "query=$GRAPHQL_DOCUMENT"',
		"glab -R example/project api -X DELETE projects/123",
		"glab --repo example/project api -X DELETE projects/123",
		"GITLAB_HOST=gitlab.example.com glab repo delete example/project --yes",
		"command glab mr merge 42",
		"env GITLAB_HOST=gitlab.example.com glab issue delete 42",
		"printf ready | glab ci run --branch main",
		"echo $(glab ci cancel pipeline 123)",
		'glab mr "$(printf merge)" 42',
		'action=merge; glab mr "$action" 42',
	] as const;

	for (const command of commands) {
		const risk = analyzeBashCommand(command);
		assert.ok(risk, command);
		assert.ok(risk.reasons.some((reason) => reason.startsWith("glab ")), command);
		assert.ok(analyzeGitLabCliCommand(command), `headless policy: ${command}`);
	}
});

test("allows non-dangerous GitHub CLI operations", () => {
	const commands = [
		"gh auth status",
		"gh repo view owner/repo",
		"gh repo edit owner/repo --description example",
		"gh repo sync owner/fork",
		"gh pr merge 42 --disable-auto",
		"gh pr merge 42 --disable-auto=1",
		"gh pr merge 42 --disable-auto=t",
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

test("allows non-dangerous GitLab CLI operations", () => {
	const commands = [
		"glab auth status",
		"glab repo view example/project",
		"glab repo archive main",
		"glab repo update example/project --description example",
		"glab mr view 42",
		"glab mr approve 42",
		"glab mr note 42 --message looks-good",
		"glab issue create --title example --description details",
		"glab issue note 42 --message details",
		"glab release create v1.0.0 --notes release",
		"glab release upload v1.0.0 artifact.tgz",
		"glab ci list",
		"glab ci cancel pipeline 123 --dry-run",
		"glab ci cancel pipeline 123 --dry-run=1",
		"glab ci delete 123 --dry-run",
		"glab ci delete 123 --dry-run=t",
		"glab ci run --web",
		"glab ci run --web=1",
		"glab ci run -w",
		"glab ci cancel pipeline 123 --dry-run=false --dry-run=true",
		"glab ci delete 123 --dry-run=false --dry-run=true",
		"glab schedule list",
		"glab schedule update 10 --description nightly",
		"glab variable list",
		"glab runner list",
		"glab runner update 123 --unpause",
		"glab securefile list",
		"glab api projects/123",
		"glab api --method GET projects/123/issues -f per_page=100",
		"glab api --method OPTIONS projects/123",
		"glab api graphql -f 'query=query { currentUser { username } }'",
		"glab api graphql -f 'query=query($id: ID!) { node(id: $id) { id } }'",
		"glab api graphql -f query=@literal-value",
		"echo 'glab repo delete example/project'",
	] as const;

	for (const command of commands) {
		assert.equal(analyzeBashCommand(command), null, command);
		assert.equal(analyzeGitLabCliCommand(command), null, `headless policy: ${command}`);
	}
});

test("identifies destructive segments within command chains", () => {
	const cases = [
		["source .venv/bin/activate && printf 'safe'; rm -rf 'tmp dir'; git status", ["rm -rf 'tmp dir'"]],
		["echo data > /etc/example && git status --short", ["echo data > /etc/example"]],
		["gh repo view owner/repo && gh repo delete owner/repo --yes; gh status", ["gh repo delete owner/repo --yes"]],
		["glab mr view 42 && glab mr merge 42; glab ci list", ["glab mr merge 42"]],
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

test("hard-blocks dangerous GitLab commands in headless subagents", () => {
	const extensionUrl = new URL("../extensions/bash-guard/index.ts", import.meta.url).href;
	const script = `
		import bashGuard from ${JSON.stringify(extensionUrl)};
		let handler;
		bashGuard({
			on(event, callback) {
				if (event === "tool_call") handler = callback;
			},
		});
		const result = await handler(
			{ type: "tool_call", toolCallId: "test-call", toolName: "bash", input: { command: process.argv[1] } },
			{ hasUI: false },
		);
		process.stdout.write(JSON.stringify(result));
	`;

	for (const command of [
		"glab mr merge 42",
		'glab mr "$(printf merge)" 42',
		"glab -R example/project api -X DELETE projects/123",
	]) {
		const result = spawnSync(
			process.execPath,
			["--import", "tsx", "--input-type=module", "-e", script, command],
			{
				encoding: "utf8",
				env: { ...process.env, PI_SUBAGENT_DEPTH: "1" },
			},
		);
		assert.equal(result.status, 0, result.stderr);
		const block = JSON.parse(result.stdout) as { block?: boolean; reason?: string };
		assert.equal(block.block, true, command);
		assert.match(block.reason ?? "", /dangerous GitLab operations are not permitted/, command);
	}
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
