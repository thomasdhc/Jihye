import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type AgentConfig, buildPiArgs, loadAgentsFromDirectories } from "../extensions/subagent/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function extensionArgs(args: string[]): string[] {
	const paths: string[] = [];
	for (let index = 0; index < args.length - 1; index += 1) {
		if (args[index] === "--extension") paths.push(args[index + 1]!);
	}
	return paths;
}

test("loads portable bundled agent model specifications", () => {
	const bundledAgents = loadAgentsFromDirectories([join(REPO_ROOT, "agents")]);
	const byName = new Map(bundledAgents.map((agent) => [agent.name, agent]));

	assert.deepEqual([...byName.keys()].sort(), ["researcher", "reviewer", "scout", "worker"]);
	for (const agent of bundledAgents) {
		assert.equal(agent.model, "openai-codex/gpt-5.6-sol");
	}
	assert.equal(byName.get("scout")?.thinking, "medium");
	assert.equal(byName.get("researcher")?.thinking, "medium");
	assert.equal(byName.get("reviewer")?.thinking, "high");
	assert.equal(byName.get("worker")?.thinking, "high");
});

test("loads user agents as full overrides of bundled defaults", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "pi-extensio-subagents-"));
	const userDir = join(tempDir, "agents");
	mkdirSync(userDir);
	writeFileSync(join(userDir, "scout.md"), `---
name: scout
description: User scout
tools: read
model: anthropic/claude-sonnet-4-6
thinking: low
---

User-specific scout prompt.
`);
	writeFileSync(join(userDir, "specialist.md"), `---
name: specialist
description: User-only specialist
tools: read
---

Specialist prompt.
`);

	try {
		const bundledDir = join(REPO_ROOT, "agents");
		const withoutUserOverrides = loadAgentsFromDirectories([bundledDir, join(tempDir, "missing")]);
		const agents = loadAgentsFromDirectories([bundledDir, userDir]);
		const byName = new Map(agents.map((agent) => [agent.name, agent]));
		const scout = byName.get("scout");
		const specialist = byName.get("specialist");

		assert.equal(withoutUserOverrides.length, 4);
		assert.equal(agents.length, 5);
		assert.equal(scout?.description, "User scout");
		assert.deepEqual(scout?.tools, ["read"]);
		assert.equal(scout?.model, "anthropic/claude-sonnet-4-6");
		assert.equal(scout?.thinking, "low");
		assert.equal(scout?.systemPrompt.trim(), "User-specific scout prompt.");
		assert.equal(scout?.filePath, join(userDir, "scout.md"));
		assert.equal(specialist?.model, "openai-codex/gpt-5.6-sol");
		assert.equal(specialist?.thinking, "medium");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("rejects duplicate agent names within one directory", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "pi-extensio-subagents-"));
	writeFileSync(join(tempDir, "first.md"), "---\nname: duplicate\n---\nFirst\n");
	writeFileSync(join(tempDir, "second.md"), "---\nname: duplicate\n---\nSecond\n");

	try {
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Duplicate agent name "duplicate"/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

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
