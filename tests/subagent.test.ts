import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type AgentConfig, buildPiArgs, getAgentDirectories, loadAgentsFromDirectories } from "../extensions/subagent/index.ts";

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
	assert.equal(byName.get("reviewer")?.thinking, "medium");
	assert.equal(byName.get("worker")?.thinking, "high");
});

test("keeps the bundled reviewer bounded", () => {
	const reviewer = loadAgentsFromDirectories([join(REPO_ROOT, "agents")])
		.find((agent) => agent.name === "reviewer");

	assert.ok(reviewer);
	assert.match(reviewer.systemPrompt, /Treat that scope as a hard boundary/);
	assert.match(reviewer.systemPrompt, /at most three falsifiable/);
	assert.match(reviewer.systemPrompt, /no more than six tool calls total/);
	assert.match(reviewer.systemPrompt, /verify only the listed fixes and their immediate regression surface/);
	assert.match(reviewer.systemPrompt, /at most 300 words/);
});

test("resolves bundled, user, then package-local agent directories", () => {
	const workspace = join(tmpdir(), "pi-extensio-workspace-fixture");
	assert.deepEqual(getAgentDirectories(workspace), [
		join(REPO_ROOT, "agents"),
		join(process.env.HOME || "", ".pi/agent/agents"),
		join(REPO_ROOT, ".pi/agents"),
	]);
});

test("loads user and package-local agents as full sequential overrides of bundled defaults", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "pi-extensio-subagents-"));
	const packageLocalDir = join(tempDir, "package", ".pi", "agents");
	const userDir = join(tempDir, "agents");
	mkdirSync(packageLocalDir, { recursive: true });
	mkdirSync(userDir);
	writeFileSync(join(packageLocalDir, "scout.md"), `---
name: scout
description: Package-local scout
tools: read
model: openai-codex/gpt-5.5
thinking: medium
---

Package-local scout prompt.
`);
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
		const withoutUserOverrides = loadAgentsFromDirectories([bundledDir, join(tempDir, "missing"), packageLocalDir]);
		const agents = loadAgentsFromDirectories([bundledDir, userDir, packageLocalDir]);
		const byName = new Map(agents.map((agent) => [agent.name, agent]));
		const scout = byName.get("scout");
		const specialist = byName.get("specialist");

		assert.equal(withoutUserOverrides.length, 4);
		assert.equal(withoutUserOverrides.find((agent) => agent.name === "scout")?.description, "Package-local scout");
		assert.equal(agents.length, 5);
		assert.equal(scout?.description, "Package-local scout");
		assert.deepEqual(scout?.tools, ["read"]);
		assert.equal(scout?.model, "openai-codex/gpt-5.5");
		assert.equal(scout?.thinking, "medium");
		assert.equal(scout?.systemPrompt.trim(), "Package-local scout prompt.");
		assert.equal(scout?.filePath, join(packageLocalDir, "scout.md"));
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
