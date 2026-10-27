import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	defaultWebSearchRequiresMcp,
	loadWebSearchConfig,
	requiresBuiltinMcp,
} from "../extensions/web-search/config.ts";

function withTempConfig(content: string | undefined, fn: (path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "jihye-websearch-"));
	const file = join(dir, "config.json");
	if (content !== undefined) writeFileSync(file, content, "utf-8");
	try {
		fn(file);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("loadWebSearchConfig defaults to Serper when no file exists", () => {
	withTempConfig(undefined, (file) => {
		assert.deepEqual(loadWebSearchConfig(file), {});
		assert.equal(requiresBuiltinMcp(loadWebSearchConfig(file)), false);
		assert.equal(defaultWebSearchRequiresMcp(file), false);
	});
});

test("loadWebSearchConfig accepts explicit Serper and MCP backends", () => {
	withTempConfig(JSON.stringify({ backend: "serper" }), (file) => {
		assert.equal(loadWebSearchConfig(file).backend, "serper");
		assert.equal(defaultWebSearchRequiresMcp(file), false);
	});
	withTempConfig(JSON.stringify({ backend: "mcp", mcpTool: "mcp__examples__search" }), (file) => {
		const config = loadWebSearchConfig(file);
		assert.equal(config.backend, "mcp");
		assert.equal(config.mcpTool, "mcp__examples__search");
		assert.equal(defaultWebSearchRequiresMcp(file), true);
	});
});

test("loadWebSearchConfig rejects malformed content and unknown backends", () => {
	withTempConfig("not json", (file) => {
		assert.throws(() => loadWebSearchConfig(file), new RegExp(`Invalid JSON at ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
	});
	withTempConfig(JSON.stringify({ backend: "bing" }), (file) => {
		assert.throws(() => loadWebSearchConfig(file), /backend must be one of "serper", "mcp"/);
	});
	withTempConfig(JSON.stringify({ backend: "mcp" }), (file) => {
		assert.throws(() => loadWebSearchConfig(file), /backend "mcp" requires a non-empty mcpTool/);
	});
	withTempConfig(JSON.stringify([{ backend: "mcp" }]), (file) => {
		assert.throws(() => loadWebSearchConfig(file), /expected a JSON object/);
	});
});
