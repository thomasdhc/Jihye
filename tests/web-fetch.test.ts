import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";

import { DEFAULT_MAX_BYTES, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import webFetch, {
	extractHTML,
	formatFetchOutput,
	isNonPublicIp,
	readResponseBytes,
	ResponseTooLargeError,
	validatePublicHttpUrl,
} from "../extensions/web-fetch/index.ts";

test("keeps normal article extraction unchanged", () => {
	const paragraph = "This article explains how to fetch and read public web content safely. ".repeat(12);
	const result = extractHTML(
		`<html><head><title>Example article</title></head><body><article><h1>Example article</h1><p>${paragraph}</p></article></body></html>`,
		"https://example.com/article",
	);

	assert.equal(result.error, null);
	assert.equal(result.title, "Example article");
	assert.ok(result.content.includes(paragraph.trim()));
	assert.equal(result.partial, undefined);
	assert.doesNotMatch(result.content, /Note: Returning available/);
});

test("returns short page content even when the JavaScript heuristic matches", () => {
	const scripts = "<script>window.app = {};</script>".repeat(4);
	const result = extractHTML(
		`<html><head><title>Status</title></head><body><main><h1>Status</h1><p>All systems operational.</p></main>${scripts}</body></html>`,
		"https://example.com/status",
	);

	assert.equal(result.error, null);
	assert.equal(result.partial, true);
	assert.match(result.content, /All systems operational/);
	assert.match(result.content, /may be incomplete/);
	assert.match(result.content, /JavaScript was not executed/);
});

test("recovers non-article lists and links from the page body", () => {
	const result = extractHTML(
		'<html><body><ul><li><a href="https://example.com/first">First result</a></li><li><a href="https://example.com/second">Second result</a></li></ul></body></html>',
		"https://example.com/results",
	);

	assert.equal(result.error, null);
	assert.match(result.content, /\[First result\]\(https:\/\/example\.com\/first\)/);
	assert.match(result.content, /\[Second result\]\(https:\/\/example\.com\/second\)/);
});

test("tries embedded Next.js content when article extraction is short", () => {
	const text = "This content was embedded in the page response rather than rendered into the visible article. ".repeat(3);
	const payload = "0:" + JSON.stringify(["$", "p", null, { children: text }]) + "\n";
	const result = extractHTML(
		`<html><head><title>Embedded article</title></head><body><p>Loading...</p><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`,
		"https://example.com/embedded",
	);

	assert.equal(result.error, null);
	assert.equal(result.content, text.trim());
	assert.equal(result.partial, undefined);
});

test("does not return scripts or hidden markup as fallback content", () => {
	const result = extractHTML(
		'<html><body><main><p>Visible page content.</p><script>SECRET_SCRIPT</script><style>SECRET_STYLE</style><template>SECRET_TEMPLATE</template><p hidden>SECRET_HIDDEN</p><p aria-hidden="true">SECRET_ARIA</p></main></body></html>',
		"https://example.com/page",
	);

	assert.equal(result.error, null);
	assert.match(result.content, /Visible page content/);
	assert.doesNotMatch(result.content, /SECRET_/);
});

test("still reports an empty JavaScript shell as unavailable", () => {
	const scripts = "<script>window.app = {};</script>".repeat(4);
	const result = extractHTML(
		`<html><body>${scripts}</body></html>`,
		"https://example.com/app",
	);

	assert.match(result.error ?? "", /JavaScript-rendered/);
	assert.equal(result.content, "");
});

for (const scenario of [
	{ name: "returns partial content through the tool without contacting Jina by default", allowJina: false, jinaStatus: 503, expected: "All systems operational", requests: 1 },
	{ name: "still tries Jina for partial content when explicitly enabled", allowJina: true, jinaStatus: 200, expected: "Rendered page content", requests: 2 },
	{ name: "keeps available page content when the opted-in Jina fallback fails", allowJina: true, jinaStatus: 503, expected: "All systems operational", requests: 2 },
]) {
	test(scenario.name, async (t) => {
		let tool: Parameters<ExtensionAPI["registerTool"]>[0] | undefined;
		webFetch({
			registerFlag() {},
			getFlag: () => scenario.allowJina,
			registerTool(definition: NonNullable<typeof tool>) {
				tool = definition;
			},
		} as never);
		assert.ok(tool);

		// Keep this end-to-end tool check independent of DNS and network access.
		t.mock.method(dns, "lookup", async () => [{ address: "1.1.1.1", family: 4 }]);
		syncBuiltinESMExports();
		t.after(() => {
			t.mock.restoreAll();
			syncBuiltinESMExports();
		});
		const requests: string[] = [];
		t.mock.method(globalThis, "fetch", async (input: URL) => {
			const url = input.toString();
			requests.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return new Response("Markdown Content:\n" + "Rendered page content. ".repeat(10), {
					status: scenario.jinaStatus,
				});
			}
			return new Response("<html><body><p>All systems operational.</p></body></html>", {
				headers: { "content-type": "text/html" },
			});
		});

		const result = await tool.execute("test", { url: "https://1.1.1.1/status" }, undefined, undefined, {} as never);
		const text = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
		assert.ok(text.includes(scenario.expected));
		assert.equal(requests.length, scenario.requests);
	});
}

test("rejects private, local, credentialed, and unsupported URLs", () => {
	const blocked = [
		"http://localhost/admin",
		"http://service.internal/",
		"http://127.0.0.1/",
		"http://10.0.0.1/",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/",
		"http://[0:0:0:0:0:0:0:1]/",
		"http://[::ffff:127.0.0.1]/",
		"https://user:password@example.com/",
		"file:///etc/passwd",
	];

	for (const url of blocked) {
		assert.throws(() => validatePublicHttpUrl(url), undefined, url);
	}
	assert.equal(validatePublicHttpUrl("https://example.com/docs").hostname, "example.com");
});

test("classifies public and non-public IP ranges", () => {
	for (const address of ["127.0.0.1", "10.2.3.4", "192.168.1.2", "fc00::1", "fe80::1", "::ffff:7f00:1"]) {
		assert.equal(isNonPublicIp(address), true, address);
	}
	for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
		assert.equal(isNonPublicIp(address), false, address);
	}
});

test("enforces response limits while streaming the body", async () => {
	const body = new Uint8Array([1, 2, 3, 4]);
	assert.deepEqual(await readResponseBytes(new Response(body), 4), body);
	await assert.rejects(
		readResponseBytes(new Response(body), 3),
		ResponseTooLargeError,
	);
});

test("truncates extracted content to Pi's tool-output budget", () => {
	const output = formatFetchOutput({
		url: "https://example.com/article",
		title: "Example",
		content: "line of content\n".repeat(10_000),
		error: null,
	});

	assert.equal(output.truncated, true);
	assert.match(output.text, /Content truncated/);
	assert.ok(Buffer.byteLength(output.text) <= DEFAULT_MAX_BYTES);
});

test("keeps the third-party Jina fallback opt-in", () => {
	let flag: { name: string; defaultValue: unknown } | undefined;
	let registeredTool = false;
	webFetch({
		registerFlag(name: string, options: { default?: unknown }) {
			flag = { name, defaultValue: options.default };
		},
		registerTool() {
			registeredTool = true;
		},
	} as never);

	assert.deepEqual(flag, { name: "web-fetch-jina", defaultValue: false });
	assert.equal(registeredTool, true);
});
