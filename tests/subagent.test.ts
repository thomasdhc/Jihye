import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type AgentConfig, buildPiArgs } from "../extensions/subagent/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function extensionArgs(args: string[]): string[] {
	const paths: string[] = [];
	for (let index = 0; index < args.length - 1; index += 1) {
		if (args[index] === "--extension") paths.push(args[index + 1]!);
	}
	return paths;
}

test("builds portable child arguments with the requested model and safety guard", async () => {
	const previousDepth = process.env.PI_SUBAGENT_DEPTH;
	const previousAllowlist = process.env.PI_SUBAGENT_ALLOWED;
	process.env.PI_SUBAGENT_DEPTH = "2";
	process.env.PI_SUBAGENT_ALLOWED = "stale-parent-value";

	const agent: AgentConfig = {
		name: "test-agent",
		description: "Fixture agent",
		tools: ["bash", "web_search", "web_fetch", "safe_bash", "subagent"],
		model: "openai-codex/gpt-5.6-sol",
		thinking: "high",
		systemPrompt: "Test system prompt",
		filePath: "<fixture>",
		subagentAgents: ["scout", "reviewer"],
	};

	let tempDir: string | undefined;
	try {
		const built = await buildPiArgs(agent, "Inspect the fixture", REPO_ROOT);
		tempDir = built.tempDir;

		const modelIndex = built.args.indexOf("--model");
		assert.notEqual(modelIndex, -1);
		assert.equal(built.args[modelIndex + 1], agent.model);
		assert.equal(built.args.includes("--models"), false);

		const paths = extensionArgs(built.args);
		const expected = [
			join(REPO_ROOT, "extensions/bash-guard/index.ts"),
			join(REPO_ROOT, "extensions/web-search/index.ts"),
			join(REPO_ROOT, "extensions/web-fetch/index.ts"),
			join(REPO_ROOT, "extensions/subagent/tools/safe-bash.ts"),
			join(REPO_ROOT, "extensions/subagent/index.ts"),
		];
		assert.deepEqual(new Set(paths), new Set(expected));
		assert.ok(paths.every((path) => existsSync(path)));

		assert.equal(built.childEnv.PI_SUBAGENT_DEPTH, "3");
		assert.equal(built.childEnv.PI_SUBAGENT_ALLOWED, "scout,reviewer");
	} finally {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		if (previousDepth === undefined) delete process.env.PI_SUBAGENT_DEPTH;
		else process.env.PI_SUBAGENT_DEPTH = previousDepth;
		if (previousAllowlist === undefined) delete process.env.PI_SUBAGENT_ALLOWED;
		else process.env.PI_SUBAGENT_ALLOWED = previousAllowlist;
	}
});
