import assert from "node:assert/strict";
import test from "node:test";

import { buildSearchQuery } from "../extensions/web-search/index.ts";
import {
	cleanSnippet,
	parseMcpSearchPayload,
	runMcpToolSearch,
	sortEntriesByScore,
	waitForCallableTool,
	type McpToolCaller,
	type RawMcpSearchEntry,
} from "../extensions/web-search/mcp.ts";

test("buildSearchQuery composes query, phrases, exclusions, and site", () => {
	assert.throws(() => buildSearchQuery({}), /At least one of 'query' or 'exactPhrases' is required/);
	assert.deepEqual(
		buildSearchQuery({
			query: "pi agent",
			exactPhrases: ["tool search"],
			excludeTerms: ["twitter", "social media"],
			site: "site:github.com/",
		}),
		{
			query: 'pi agent "tool search" -twitter -"social media" site:github.com',
			baseQuery: "pi agent",
			exactPhrases: ["tool search"],
			excludeTerms: ["twitter", "social media"],
			site: "github.com",
		},
	);
});


test("cleanSnippet strips tags, entities, and bounds length", () => {
	assert.equal(
		cleanSnippet("<p>Hello <b>world</b> &amp; friends\n\n&#x27;s copy</p>"),
		"Hello world & friends 's copy",
	);
	assert.equal(cleanSnippet("a".repeat(500)).length, 320);
	assert.equal(cleanSnippet("Plain &quot;text&quot; &#65;&#66;"), 'Plain "text" AB');
});

test("parseMcpSearchPayload maps envelopes and drops unusable entries", () => {
	const envelope = {
		result: [
			{ url: "https://a.example/", title: "A", content: "one", _north_metadata: { score: "0.5" } },
			{ url: "", title: "no url", content: "x" },
			{ url: "https://b.example/", title: "B" },
		],
	};
	assert.deepEqual(parseMcpSearchPayload(envelope), [
		{ url: "https://a.example/", title: "A", content: "one", score: 0.5 },
		{ url: "https://b.example/", title: "B", content: "", score: 0 },
	]);
	assert.deepEqual(parseMcpSearchPayload(JSON.stringify(envelope)).length, 2);
	// Text content can also carry the bare entries array, without the envelope wrapper.
	const bareArray = JSON.stringify([
		{ url: "https://c.example/", title: "C", content: "three", _north_metadata: { score: "1.0" } },
	]);
	assert.deepEqual(parseMcpSearchPayload(bareArray), [
		{ url: "https://c.example/", title: "C", content: "three", score: 1 },
	]);
	assert.throws(() => parseMcpSearchPayload("not json"), /non-JSON text/);
	assert.throws(() => parseMcpSearchPayload({ result: "no" }), /missing result array/);
	// pi's MCP client reports the wrapped CallToolResult as structuredContent.
	const wrapped = { content: [{ type: "text", text: JSON.stringify([{ url: "https://w.example/", title: "W", content: "wrap" }]) }] };
	assert.deepEqual(parseMcpSearchPayload(wrapped), [{ url: "https://w.example/", title: "W", content: "wrap", score: 0 }]);
});

test("sortEntriesByScore orders by descending score with stable ties", () => {
	const entries: RawMcpSearchEntry[] = [
		{ url: "https://low/", title: "low", content: "", score: 0.2 },
		{ url: "https://none-a/", title: "a", content: "", score: 0 },
		{ url: "https://high/", title: "high", content: "", score: 0.9 },
		{ url: "https://none-b/", title: "b", content: "", score: 0 },
	];
	assert.deepEqual(
		sortEntriesByScore(entries).map((entry) => entry.url),
		["https://high/", "https://low/", "https://none-a/", "https://none-b/"],
	);
});

function fakeCaller(overrides: Partial<McpToolCaller>, sharedTools?: { name: string }[]): McpToolCaller {
	const tools = sharedTools ?? [];
	return {
		tools,
		executeTool: async () => {
			throw new Error("not configured");
		},
		...overrides,
	};
}

test("waitForCallableTool returns when present, late-appearing, or throws on timeout", async () => {
	await waitForCallableTool(fakeCaller({ tools: [{ name: "mcp__a__b" }] }), "mcp__a__b", 300, 20);

	const sharedTools: { name: string }[] = [];
	setTimeout(() => sharedTools.push({ name: "mcp__a__c" }), 40);
	await waitForCallableTool(fakeCaller({}, sharedTools), "mcp__a__c", 2000, 20);

	await assert.rejects(
		() => waitForCallableTool(fakeCaller({}), "mcp__a__missing", 150, 20),
		/"mcp__a__missing" was not callable within 150 ms/,
	);
});

test("runMcpToolSearch calls the tool, sorts by score, and slices to count", async () => {
	const seen: { name?: string; args?: unknown } = {};
	const payload = {
		result: [
			{ url: "https://a/", title: "A", content: "<b>first</b>", _north_metadata: { score: "0.4" } },
			{ url: "https://b/", title: "B", content: "second", _north_metadata: { score: "0.9" } },
			{ url: "https://c/", title: "C", content: "third" },
		],
	};
	const caller = fakeCaller({
		tools: [{ name: "mcp__fabric__search" }],
		executeTool: async (name, args) => {
			seen.name = name;
			seen.args = args;
			return {
				toolCall: { type: "toolCall", id: "x/1", name, arguments: args } as never,
				result: { content: [{ type: "text", text: JSON.stringify(payload) }], details: undefined } as never,
				isError: false,
			};
		},
	});
	const results = await runMcpToolSearch(caller, "mcp__fabric__search", "query", 2);
	assert.equal(seen.name, "mcp__fabric__search");
	assert.deepEqual(seen.args, { query: "query" });
	assert.deepEqual(
		results.map((r) => r.url),
		["https://b/", "https://a/"],
	);
	assert.equal(results[0]!.snippet, "second");
	assert.equal(results[1]!.snippet, "first");
});

test("runMcpToolSearch prefers structuredContent and surfaces tool errors", async () => {
	const structuredCaller = fakeCaller({
		tools: [{ name: "mcp__f__s" }],
		executeTool: async () => ({
			toolCall: {} as never,
			result: {
				content: [{ type: "text", text: "ignored" }],
				details: undefined,
				structuredContent: { result: [{ url: "https://s/", title: "S", content: "via structured" }] },
			} as never,
			isError: false,
		}),
	});
	assert.deepEqual(await runMcpToolSearch(structuredCaller, "mcp__f__s", "q", 10), [
		{ title: "S", url: "https://s/", snippet: "via structured" },
	]);

	const errorCaller = fakeCaller({
		tools: [{ name: "mcp__f__s" }],
		executeTool: async () => ({
			toolCall: {} as never,
			result: { content: [{ type: "text", text: "gateway is down" }], details: undefined } as never,
			isError: true,
		}),
	});
	await assert.rejects(
		() => runMcpToolSearch(errorCaller, "mcp__f__s", "q", 10),
		/MCP web search failed: gateway is down/,
	);
});

test("runMcpToolSearch fails with the configured tool name when it never appears", async () => {
	await assert.rejects(
		() => runMcpToolSearch(fakeCaller({}), "mcp__fabric__search", "q", 5, undefined, 150),
		/"mcp__fabric__search" was not callable/,
	);
});

