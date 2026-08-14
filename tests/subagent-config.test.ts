import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_MAX_CONCURRENCY, loadConfig } from "../extensions/subagent/config.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "jihye-subagent-config-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("treats a missing config file as no configuration", () => {
	withTempDir((dir) => {
		const config = loadConfig(join(dir, "config.json"));

		assert.deepEqual(config, {});
		assert.equal(config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY, DEFAULT_MAX_CONCURRENCY);
	});
});

test("loads settings from a valid config file", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		writeFileSync(configPath, JSON.stringify({ maxConcurrency: 7, enableAlternateProviders: true }));

		assert.deepEqual(loadConfig(configPath), { maxConcurrency: 7, enableAlternateProviders: true });
	});
});

test("rejects invalid maxConcurrency values", () => {
	const cases: Array<{ name: string; value: unknown }> = [
		{ name: "zero", value: 0 },
		{ name: "negative", value: -1 },
		{ name: "fractional", value: 1.5 },
		{ name: "string", value: "7" },
		{ name: "null", value: null },
		{ name: "unsafe integer", value: Number.MAX_SAFE_INTEGER + 1 },
	];

	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		const expectedMessage = `Invalid subagent config at ${configPath}: maxConcurrency must be a positive integer within JavaScript's safe range`;

		for (const { name, value } of cases) {
			writeFileSync(configPath, JSON.stringify({ maxConcurrency: value }));
			assert.throws(
				() => loadConfig(configPath),
				(error: unknown) => error instanceof Error && error.message === expectedMessage,
				`${name} maxConcurrency should be rejected`,
			);
		}
	});
});

test("rejects a non-boolean alternate-provider setting", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		writeFileSync(configPath, JSON.stringify({ enableAlternateProviders: "yes" }));

		assert.throws(() => loadConfig(configPath), /enableAlternateProviders must be a boolean/);
	});
});

test("reports a malformed config file instead of discarding its settings", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		writeFileSync(configPath, '{ "maxConcurrency": 7,\n');

		assert.throws(() => loadConfig(configPath), new RegExp(`Invalid JSON at ${configPath}`));
	});
});
