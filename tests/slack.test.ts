import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import { SlackApiError, SlackClient } from "../extensions/slack/client.ts";
import { loadSlackConfig } from "../extensions/slack/config.ts";
import {
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
