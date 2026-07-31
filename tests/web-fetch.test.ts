import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import webFetch, {
	formatFetchOutput,
	isNonPublicIp,
	readResponseBytes,
	ResponseTooLargeError,
	validatePublicHttpUrl,
} from "../extensions/web-fetch/index.ts";

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
