import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import {
	installNoPromptCacheProvider,
	withoutPromptCaching,
} from "../extensions/slack/cache-policy.ts";
import { SlackApiError, SlackClient } from "../extensions/slack/client.ts";
import {
	assistantTextFromJsonEvent,
	buildSlackConsultLaunch,
	createSlackConsultExtension,
	runSlackConsult,
} from "../extensions/slack/consult.ts";
import {
	captureSlackUserToken,
	loadSlackConfig,
	loadSlackConsultModel,
	slackModelConfigPath,
} from "../extensions/slack/config.ts";
import slackChildExtension from "../lib/slack-child.ts";
import slackPackageExtension, {
	assertEphemeralSlackSession,
	boundSlackOutput,
	createSlackExtension,
	formatSlackConversation,
	normalizeSlackSearchArgs,
	parseSlackMessageReference,
} from "../extensions/slack/index.ts";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

function captureTools(fetchImpl: typeof fetch) {
	const tools = new Map<string, any>();
	createSlackExtension({
		env: { SLACK_USER_TOKEN: "xoxp-test-token" },
		fetch: fetchImpl,
	})({
		registerTool(tool: { name: string }) {
			tools.set(tool.name, tool);
		},
	} as never);
	return tools;
}

const ephemeralContext = {
	sessionManager: {
		getSessionFile: () => undefined,
	},
};

test("loads only an OAuth Slack user token", () => {
	assert.deepEqual(loadSlackConfig({ SLACK_USER_TOKEN: " xoxp-secret " }), {
		token: "xoxp-secret",
	});
	assert.throws(() => loadSlackConfig({}), /Missing Slack credentials/);
	assert.throws(
		() => loadSlackConfig({ SLACK_USER_TOKEN: "xoxb-bot" }),
		/OAuth user token beginning with xoxp-/,
	);
});

test("loads an explicitly approved Slack model from the environment or user config", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-slack-model-"));
	const configPath = join(dir, "pi-slack-model.json");
	try {
		assert.equal(
			loadSlackConsultModel(
				{ PI_SLACK_MODEL: " approved-provider/approved-model " },
				configPath,
			),
			"approved-provider/approved-model",
		);
		writeFileSync(configPath, JSON.stringify({ model: "configured-provider/configured-model" }));
		assert.equal(
			loadSlackConsultModel({}, configPath),
			"configured-provider/configured-model",
		);
		assert.equal(
			loadSlackConsultModel(
				{ PI_SLACK_MODEL: "environment-provider/environment-model" },
				configPath,
			),
			"environment-provider/environment-model",
		);
		assert.throws(
			() => loadSlackConsultModel({ PI_SLACK_MODEL: "missing-provider" }, configPath),
			/provider\/model/,
		);
		writeFileSync(configPath, "not-json");
		assert.throws(
			() => loadSlackConsultModel({}, configPath),
			/must contain valid JSON/,
		);
		writeFileSync(configPath, JSON.stringify({ model: "missing-provider" }));
		assert.throws(
			() => loadSlackConsultModel({}, configPath),
			/provider\/model/,
		);
		rmSync(configPath);
		assert.throws(
			() => loadSlackConsultModel({}, configPath),
			/never inherits the parent model/,
		);
		assert.equal(
			slackModelConfigPath({ PI_CODING_AGENT_DIR: dir }),
			configPath,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("captures the Slack token outside the process environment and reuses the in-memory vault", () => {
	const env = { SLACK_USER_TOKEN: " xoxp-secret " };
	const vault: { token?: string } = {};
	assert.equal(captureSlackUserToken(env, vault), "xoxp-secret");
	assert.equal(env.SLACK_USER_TOKEN, undefined);
	assert.equal(captureSlackUserToken(env, vault), "xoxp-secret");
});

test("builds an isolated no-session Slack child launch without putting secrets in arguments", () => {
	const launch = buildSlackConsultLaunch({
		model: "provider/model",
		thinking: "medium",
		token: "xoxp-secret",
		parentEnv: {
			HOME: "/tmp/home",
			PI_SESSION_ID: "parent-id",
			PI_SESSION_FILE: "/tmp/parent.jsonl",
			PI_SUBAGENT_ALLOWED: "researcher",
			PI_TUI_WRITE_LOG: "/tmp/tui.log",
			PI_CACHE_RETENTION: "long",
			PI_SLACK_MODEL: "provider/model",
			PI_SLACK_THINKING: "high",
		},
		piBinary: { command: "/usr/local/bin/pi", baseArgs: [] },
	});

	assert.equal(launch.command, "/usr/local/bin/pi");
	for (const flag of [
		"--no-session",
		"--no-context-files",
		"--no-skills",
		"--no-prompt-templates",
		"--no-extensions",
	]) {
		assert.ok(launch.args.includes(flag), flag);
	}
	assert.equal(launch.args[launch.args.indexOf("--tools") + 1], "slack_search,slack_read");
	assert.equal(launch.args.includes("xoxp-secret"), false);
	assert.equal(launch.env.SLACK_USER_TOKEN, "xoxp-secret");
	assert.equal(launch.env.PI_SESSION_ID, undefined);
	assert.equal(launch.env.PI_SESSION_FILE, undefined);
	assert.equal(launch.env.PI_SUBAGENT_ALLOWED, undefined);
	assert.equal(launch.env.PI_TUI_WRITE_LOG, undefined);
	assert.equal(launch.env.PI_CACHE_RETENTION, undefined);
	assert.equal(launch.env.PI_SLACK_MODEL, undefined);
	assert.equal(launch.env.PI_SLACK_THINKING, undefined);
});

test("forces no prompt caching after provider-scoped request options are resolved", async () => {
	const cacheRetentions: unknown[] = [];
	const deferredCalls: string[] = [];
	const models = [{ provider: "approved-provider", id: "approved-model" }];
	const provider = {
		id: "approved-provider",
		name: "Approved Provider",
		baseUrl: "https://provider.example/v1",
		auth: { apiKey: {} },
		getModels() {
			return models;
		},
		stream(_model: unknown, _context: unknown, options: { cacheRetention?: string }) {
			cacheRetentions.push(options.cacheRetention);
			return {};
		},
		streamSimple(_model: unknown, _context: unknown, options: { cacheRetention?: string }) {
			cacheRetentions.push(options.cacheRetention);
			return {};
		},
		fetchDeferred() {
			assert.equal(this, provider);
			deferredCalls.push("fetch");
			return "fetched";
		},
		cancelDeferred() {
			assert.equal(this, provider);
			deferredCalls.push("cancel");
			return Promise.resolve();
		},
	};
	const wrapped = withoutPromptCaching(provider as never);

	wrapped.stream(models[0] as never, {} as never, {
		cacheRetention: "long",
		env: { PI_CACHE_RETENTION: "long" },
	} as never);
	wrapped.streamSimple(models[0] as never, {} as never, {
		cacheRetention: "long",
		env: { PI_CACHE_RETENTION: "long" },
	});
	assert.deepEqual(cacheRetentions, ["none", "none"]);
	assert.equal(wrapped.id, provider.id);
	assert.equal(wrapped.auth, provider.auth);
	assert.equal(wrapped.getModels(), models);
	const deferred = wrapped as typeof wrapped & {
		fetchDeferred: () => string;
		cancelDeferred: () => Promise<void>;
	};
	assert.equal(deferred.fetchDeferred(), "fetched");
	await deferred.cancelDeferred();
	assert.deepEqual(deferredCalls, ["fetch", "cancel"]);
});

test("installs the no-cache wrapper for the Slack child's selected provider", () => {
	const provider = {
		id: "approved-provider",
		name: "Approved Provider",
		auth: { apiKey: {} },
		getModels: () => [],
		stream: () => ({}),
		streamSimple: () => ({}),
	};
	let registered: unknown;
	installNoPromptCacheProvider({
		registerProvider(value: unknown) {
			registered = value;
		},
	} as never, {
		model: { provider: "approved-provider", id: "approved-model" },
		modelRegistry: {
			getProvider: (id: string) => id === provider.id ? provider : undefined,
		},
	} as never);
	assert.equal((registered as { id?: string })?.id, provider.id);
});

test("Slack child enables input only after installing its no-cache provider", () => {
	const handlers = new Map<string, (event: unknown, ctx: any) => unknown>();
	const registeredTools: string[] = [];
	let registeredProvider: unknown;
	let shutdown = false;
	const provider = {
		id: "approved-provider",
		name: "Approved Provider",
		auth: { apiKey: {} },
		getModels: () => [],
		stream: () => ({}),
		streamSimple: () => ({}),
	};
	slackChildExtension({
		on(event: string, handler: (event: unknown, ctx: any) => unknown) {
			handlers.set(event, handler);
		},
		registerProvider(value: unknown) {
			registeredProvider = value;
		},
		registerTool(tool: { name: string }) {
			registeredTools.push(tool.name);
		},
	} as never);
	const ctx = {
		model: { provider: provider.id, id: "approved-model" },
		modelRegistry: { getProvider: () => provider },
		shutdown: () => { shutdown = true; },
	};

	handlers.get("session_start")?.({}, ctx);
	assert.equal((registeredProvider as { id?: string })?.id, provider.id);
	assert.deepEqual(handlers.get("input")?.({}, ctx), { action: "continue" });
	assert.equal(shutdown, false);
	assert.deepEqual(registeredTools, ["slack_search", "slack_read"]);
});

test("Slack child fails closed when no-cache provider installation fails", () => {
	const previousExitCode = process.exitCode;
	const handlers = new Map<string, (event: unknown, ctx: any) => unknown>();
	let shutdownCount = 0;
	try {
		slackChildExtension({
			on(event: string, handler: (event: unknown, ctx: any) => unknown) {
				handlers.set(event, handler);
			},
			registerProvider() {
				throw new Error("registration failed");
			},
			registerTool() {},
		} as never);
		const ctx = {
			model: { provider: "approved-provider", id: "approved-model" },
			modelRegistry: { getProvider: () => ({
				id: "approved-provider",
				name: "Approved Provider",
				auth: { apiKey: {} },
				getModels: () => [],
				stream: () => ({}),
				streamSimple: () => ({}),
			}) },
			shutdown: () => { shutdownCount++; },
		};

		handlers.get("session_start")?.({}, ctx);
		assert.equal(process.exitCode, 1);
		assert.deepEqual(handlers.get("input")?.({}, ctx), { action: "handled" });
		assert.equal(shutdownCount, 2);
	} finally {
		process.exitCode = previousExitCode;
	}
});

test("extracts only finalized assistant text from Pi JSON events", () => {
	assert.equal(assistantTextFromJsonEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "Decision summary" }],
		},
	}), "Decision summary");
	assert.equal(assistantTextFromJsonEvent({
		type: "message_end",
		message: { role: "toolResult", content: [{ type: "text", text: "raw Slack" }] },
	}), undefined);
});

test("runs the consultation question over stdin and captures only the child assistant answer", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "slack-consult-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const script = join(dir, "child.mjs");
	writeFileSync(script, `
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "message_end", message: {
    role: "toolResult", content: [{ type: "text", text: "raw Slack data" }]
  }}));
  console.log(JSON.stringify({ type: "message_end", message: {
    role: "assistant", content: [{ type: "text", text: "Answer for: " + input }]
  }}));
});
`);

	const answer = await runSlackConsult("What was decided?", {
		command: process.execPath,
		args: [script],
		env: { ...process.env },
	});
	assert.equal(answer, "Answer for: What was decided?");
	assert.doesNotMatch(answer, /raw Slack data/);
});

test("does not surface arbitrary child stderr in consultation errors", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "slack-consult-error-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const script = join(dir, "child.mjs");
	writeFileSync(script, `
process.stdin.resume();
process.stdin.on("end", () => {
  process.stderr.write("sensitive child diagnostic");
  process.exit(2);
});
`);

	await assert.rejects(
		runSlackConsult("What was decided?", {
			command: process.execPath,
			args: [script],
			env: { ...process.env },
		}),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /exited with code 2/);
			assert.doesNotMatch(error.message, /sensitive child diagnostic/);
			return true;
		},
	);
});

test("slack-consult uses display-only UI without creating a parent-session message", async () => {
	let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	let customCalls = 0;
	const env = {
		SLACK_USER_TOKEN: "xoxp-secret",
		PI_SLACK_MODEL: "approved-provider/approved-model",
	};

	createSlackConsultExtension({
		env,
		vault: {},
		piBinary: { command: "/usr/local/bin/pi", baseArgs: [] },
	})({
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
	} as never);

	const notifications: string[] = [];
	await command?.handler("What was decided?", {
		mode: "tui",
		model: { provider: "provider", id: "model" },
		waitForIdle: async () => {},
		ui: {
			notify: (message: string) => notifications.push(message),
			input: async () => undefined,
			editor: async () => undefined,
			setEditorText() {},
			custom() {
				customCalls++;
				return Promise.resolve(customCalls === 1
					? { status: "completed", answer: "A concise Slack consultation." }
					: "close");
			},
		},
	});

	assert.equal(env.SLACK_USER_TOKEN, undefined);
	assert.equal(customCalls, 2);
	assert.deepEqual(notifications, []);
});

test("slack-consult never falls back to the parent model", async () => {
	let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	const notifications: string[] = [];
	createSlackConsultExtension({
		env: { SLACK_USER_TOKEN: "xoxp-secret" },
		vault: {},
		modelConfigPath: "/definitely-missing/pi-slack-model.json",
	})({
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
	} as never);

	await command?.handler("What was decided?", {
		mode: "tui",
		model: { provider: "unapproved-parent", id: "model" },
		waitForIdle: async () => {},
		ui: {
			notify: (message: string) => notifications.push(message),
			custom() {
				throw new Error("overlay must not open");
			},
		},
	});
	assert.equal(notifications.length, 1);
	assert.match(notifications[0] ?? "", /Set PI_SLACK_MODEL=provider\/model or create .*pi-slack-model\.json/);
	assert.match(notifications[0] ?? "", /never inherits the parent model/);
});

test("slack-consult refuses extended provider prompt caching", async () => {
	let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	const notifications: string[] = [];
	createSlackConsultExtension({
		env: {
			SLACK_USER_TOKEN: "xoxp-secret",
			PI_SLACK_MODEL: "approved-provider/approved-model",
			PI_CACHE_RETENTION: "long",
		},
		vault: {},
	})({
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
	} as never);

	await command?.handler("What was decided?", {
		mode: "tui",
		waitForIdle: async () => {},
		ui: {
			notify: (message: string) => notifications.push(message),
			custom() {
				throw new Error("overlay must not open");
			},
		},
	});
	assert.deepEqual(notifications, [
		"Disable PI_CACHE_RETENTION=long before consulting Slack.",
	]);
});

test("slack-consult refuses to display Slack data while TUI logging is enabled", async () => {
	let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	const notifications: string[] = [];
	createSlackConsultExtension({
		env: {
			SLACK_USER_TOKEN: "xoxp-secret",
			PI_TUI_WRITE_LOG: "/tmp/tui.log",
		},
		vault: {},
	})({
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
	} as never);

	await command?.handler("What was decided?", {
		mode: "tui",
		model: { provider: "provider", id: "model" },
		waitForIdle: async () => {},
		ui: {
			notify: (message: string) => notifications.push(message),
			custom() {
				throw new Error("overlay must not open");
			},
		},
	});
	assert.deepEqual(notifications, [
		"Disable PI_TUI_WRITE_LOG before consulting Slack so overlay content is not written to disk.",
	]);
});

test("parent package entry always registers only the command and dedicated child entry registers only tools", () => {
	const previousMarker = process.env.PI_SLACK_CHILD;
	process.env.PI_SLACK_CHILD = "1";
	try {
		const parentCommands: string[] = [];
		const parentTools: string[] = [];
		slackPackageExtension({
			registerCommand(name: string) {
				parentCommands.push(name);
			},
			registerTool(tool: { name: string }) {
				parentTools.push(tool.name);
			},
		} as never);
		assert.deepEqual(parentCommands, ["slack-consult"]);
		assert.deepEqual(parentTools, []);

		const childCommands: string[] = [];
		const childTools: string[] = [];
		slackChildExtension({
			on() {},
			registerCommand(name: string) {
				childCommands.push(name);
			},
			registerTool(tool: { name: string }) {
				childTools.push(tool.name);
			},
		} as never);
		assert.deepEqual(childCommands, []);
		assert.deepEqual(childTools, ["slack_search", "slack_read"]);
	} finally {
		if (previousMarker === undefined) delete process.env.PI_SLACK_CHILD;
		else process.env.PI_SLACK_CHILD = previousMarker;
	}
});

test("requires ephemeral Pi sessions for Slack data", () => {
	assert.doesNotThrow(() => assertEphemeralSlackSession(undefined));
	assert.throws(
		() => assertEphemeralSlackSession("/tmp/session.jsonl"),
		/--no-session/,
	);
});

test("normalizes search arguments and validates channel types", () => {
	assert.deepEqual(
		normalizeSlackSearchArgs({
			query: "  project   alpha  ",
			channelTypes: ["public_channel", "public_channel", "im"],
		}),
		{
			query: "project alpha",
			channelTypes: ["public_channel", "im"],
			count: 10,
			cursor: undefined,
		},
	);
	assert.throws(
		() => normalizeSlackSearchArgs({ query: "test", channelTypes: ["external"] }),
		/Unsupported Slack channel type/,
	);
	assert.throws(
		() => normalizeSlackSearchArgs({ query: "test", count: 21 }),
		/between 1 and 20/,
	);
});

test("parses conversation IDs and Slack message permalinks", () => {
	assert.deepEqual(parseSlackMessageReference("C123ABC"), {
		channelId: "C123ABC",
		threadTs: undefined,
	});
	assert.deepEqual(
		parseSlackMessageReference(
			"https://acme.slack.com/archives/C123ABC/p1704220800123456?thread_ts=1704220000.654321&cid=C123ABC",
		),
		{
			channelId: "C123ABC",
			threadTs: "1704220000.654321",
			sourceUrl:
				"https://acme.slack.com/archives/C123ABC/p1704220800123456?thread_ts=1704220000.654321&cid=C123ABC",
		},
	);
	assert.deepEqual(
		parseSlackMessageReference(
			"https://acme.slack.com/archives/C123ABC/p1704220800123456",
		),
		{
			channelId: "C123ABC",
			threadTs: "1704220800.123456",
			sourceUrl: "https://acme.slack.com/archives/C123ABC/p1704220800123456",
		},
	);
	assert.throws(
		() => parseSlackMessageReference("https://example.com/archives/C123/p1704220800123456"),
		/Slack conversation ID or HTTPS Slack permalink/,
	);
});

test("Slack client calls only the read-only search endpoint without putting the token in the URL", async () => {
	let requestUrl = "";
	let requestInit: RequestInit | undefined;
	const client = new SlackClient("xoxp-secret", async (input, init) => {
		requestUrl = String(input);
		requestInit = init;
		return jsonResponse({ ok: true, results: { messages: [] } });
	});

	await client.searchMessages({
		query: "project alpha",
		content_types: ["messages"],
		include_context_messages: true,
		channel_types: ["public_channel"],
		limit: 10,
	});

	assert.equal(requestUrl, "https://slack.com/api/assistant.search.context");
	assert.equal(requestInit?.method, "POST");
	assert.equal((requestInit?.headers as Record<string, string>).Authorization, "Bearer xoxp-secret");
	assert.doesNotMatch(requestUrl, /xoxp/);
	assert.deepEqual(JSON.parse(String(requestInit?.body)), {
		query: "project alpha",
		content_types: ["messages"],
		include_context_messages: true,
		channel_types: ["public_channel"],
		limit: 10,
	});
});

test("registers exactly the Slack search and read tools and formats search results", async () => {
	let signalSeen: AbortSignal | null | undefined;
	const tools = captureTools(async (_input, init) => {
		signalSeen = init?.signal;
		return jsonResponse({
			ok: true,
			results: {
				messages: [{
					author_name: "Ada",
					channel_id: "C123ABC",
					channel_name: "project-alpha",
					message_ts: "1704220800.123456",
					thread_ts: "1704220000.654321",
					content: "The rollout starts Friday.",
					permalink: "https://acme.slack.com/archives/C123ABC/p1704220800123456",
				}],
			},
			response_metadata: { next_cursor: "next-page" },
		});
	});

	assert.deepEqual([...tools.keys()], ["slack_search", "slack_read"]);
	const controller = new AbortController();
	const result = await tools.get("slack_search").execute(
		"tool-1",
		{ query: "rollout", count: 5 },
		controller.signal,
		undefined,
		ephemeralContext,
	);

	assert.equal(signalSeen, controller.signal);
	assert.match(result.content[0].text, /#project-alpha · Ada/);
	assert.match(result.content[0].text, /channel=C123ABC/);
	assert.match(result.content[0].text, /The rollout starts Friday/);
	assert.deepEqual(result.details, {
		resultCount: 1,
		nextCursor: "next-page",
		truncated: false,
	});
});

test("slack_read uses replies for a message reference and history for a channel", async () => {
	const requests: string[] = [];
	const tools = captureTools(async (input) => {
		const url = String(input);
		requests.push(url);
		if (url.includes("conversations.replies")) {
			return jsonResponse({
				ok: true,
				messages: [
					{ user: "U1", text: "Root", ts: "1704220800.123456" },
					{ user: "U2", text: "Reply", ts: "1704220860.234567", thread_ts: "1704220800.123456" },
				],
			});
		}
		return jsonResponse({
			ok: true,
			messages: [
				{ user: "U2", text: "Newer", ts: "1704220860.234567" },
				{ user: "U1", text: "Older", ts: "1704220800.123456" },
			],
		});
	});

	const threadResult = await tools.get("slack_read").execute(
		"tool-2",
		{ channel: "C123ABC", ts: "1704220800.123456" },
		undefined,
		undefined,
		ephemeralContext,
	);
	assert.match(requests[0], /conversations\.replies/);
	assert.match(requests[0], /channel=C123ABC/);
	assert.match(requests[0], /ts=1704220800\.123456/);
	assert.match(threadResult.content[0].text, /Slack thread/);
	assert.ok(threadResult.content[0].text.indexOf("Root") < threadResult.content[0].text.indexOf("Reply"));

	const historyResult = await tools.get("slack_read").execute(
		"tool-3",
		{ channel: "C123ABC" },
		undefined,
		undefined,
		ephemeralContext,
	);
	assert.match(requests[1], /conversations\.history/);
	assert.ok(historyResult.content[0].text.indexOf("Older") < historyResult.content[0].text.indexOf("Newer"));
});

test("persistent sessions are rejected before making a Slack request", async () => {
	let called = false;
	const tools = captureTools(async () => {
		called = true;
		return jsonResponse({ ok: true });
	});

	await assert.rejects(
		tools.get("slack_search").execute(
			"tool-4",
			{ query: "test" },
			undefined,
			undefined,
			{ sessionManager: { getSessionFile: () => "/tmp/session.jsonl" } },
		),
		/--no-session/,
	);
	assert.equal(called, false);
});

test("reports Slack API rate limits without exposing response data", async () => {
	const client = new SlackClient("xoxp-secret", async () => new Response("limited", {
		status: 429,
		headers: { "retry-after": "12" },
	}));

	await assert.rejects(
		client.readHistory({ channel: "C123ABC", limit: 10 }),
		(error: unknown) => {
			assert.ok(error instanceof SlackApiError);
			assert.equal(error.retryAfterSeconds, 12);
			assert.doesNotMatch(error.message, /xoxp-secret/);
			return true;
		},
	);

	const noHeaderClient = new SlackClient(
		"xoxp-secret",
		async () => new Response("limited", { status: 429 }),
	);
	await assert.rejects(
		noHeaderClient.readHistory({ channel: "C123ABC", limit: 10 }),
		(error: unknown) => {
			assert.ok(error instanceof SlackApiError);
			assert.equal(error.retryAfterSeconds, undefined);
			return true;
		},
	);
});

test("bounds Slack message output to Pi's tool budget", () => {
	const output = formatSlackConversation(
		"history",
		"C123ABC",
		undefined,
		[{ user: "U1", ts: "1704220800.123456", text: "large message\n".repeat(10_000) }],
	);
	assert.equal(output.truncated, false);
	assert.match(output.text, /\[Message truncated\]/);

	const aggregate = boundSlackOutput("line\n".repeat(20_000));
	assert.equal(aggregate.truncated, true);
	assert.match(aggregate.text, /Slack output truncated/);
	assert.ok(Buffer.byteLength(aggregate.text) <= DEFAULT_MAX_BYTES);
});
