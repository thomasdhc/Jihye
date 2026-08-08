import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadConfig } from "../extensions/subagent/config.ts";

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
		assert.deepEqual(loadConfig(join(dir, "config.json")), {});
	});
});

test("loads settings from a valid config file", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		writeFileSync(configPath, JSON.stringify({ maxConcurrency: 7 }));

		assert.deepEqual(loadConfig(configPath), { maxConcurrency: 7 });
	});
});

test("reports a malformed config file instead of discarding its settings", () => {
	withTempDir((dir) => {
		const configPath = join(dir, "config.json");
		writeFileSync(configPath, '{ "maxConcurrency": 7,\n');

		assert.throws(() => loadConfig(configPath), new RegExp(`Invalid JSON at ${configPath}`));
	});
});
