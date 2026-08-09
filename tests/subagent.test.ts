import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type AgentConfig, buildPiArgs, getAgentDirectories, loadAgentsFromDirectories } from "../extensions/subagent/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_AGENTS_DIR = join(REPO_ROOT, "personas", "subagents");

function extensionArgs(args: string[]): string[] {
	const paths: string[] = [];
	for (let index = 0; index < args.length - 1; index += 1) {
		if (args[index] === "--extension") paths.push(args[index + 1]!);
	}
	return paths;
}

test("loads portable bundled agent model specifications", () => {
	const bundledAgents = loadAgentsFromDirectories([BUNDLED_AGENTS_DIR]);
	const byName = new Map(bundledAgents.map((agent) => [agent.name, agent]));

	assert.deepEqual([...byName.keys()].sort(), ["coordinator", "engineer", "researcher", "reviewer", "scout"]);
	for (const agent of bundledAgents) {
		assert.equal(agent.model, undefined, `${agent.name} must not pin a provider-specific model`);
	}
	assert.equal(byName.get("scout")?.modelTier, "standard");
	assert.equal(byName.get("researcher")?.modelTier, "standard");
	assert.equal(byName.get("reviewer")?.modelTier, "standard");
	assert.equal(byName.get("coordinator")?.modelTier, "deep");
	assert.equal(byName.get("engineer")?.modelTier, "deep");
	assert.equal(byName.get("scout")?.thinking, "medium");
	assert.equal(byName.get("researcher")?.thinking, "medium");
	assert.equal(byName.get("reviewer")?.thinking, "medium");
	assert.equal(byName.get("coordinator")?.thinking, "high");
	assert.equal(byName.get("engineer")?.thinking, "high");
});

test("keeps the bundled coordinator recursive but bounded", () => {
	const coordinator = loadAgentsFromDirectories([BUNDLED_AGENTS_DIR])
		.find((agent) => agent.name === "coordinator");
	const reviewer = loadAgentsFromDirectories([BUNDLED_AGENTS_DIR])
		.find((agent) => agent.name === "reviewer");

	assert.ok(coordinator);
	assert.deepEqual(coordinator.tools, ["read", "grep", "find", "ls", "safe_bash", "subagent"]);
	assert.deepEqual(coordinator.subagentAgents, ["scout", "researcher", "reviewer"]);
	assert.ok(!coordinator.subagentAgents?.includes("coordinator"));
	assert.ok(!coordinator.subagentAgents?.includes("engineer"));
	assert.ok(reviewer);
	assert.ok(!reviewer.tools.includes("subagent"));
});

test("keeps the bundled reviewer bounded", () => {
	const reviewer = loadAgentsFromDirectories([BUNDLED_AGENTS_DIR])
		.find((agent) => agent.name === "reviewer");

	assert.ok(reviewer);
	assert.match(reviewer.systemPrompt, /Treat that scope as a hard boundary/);
	assert.match(reviewer.systemPrompt, /at most three falsifiable/);
	assert.match(reviewer.systemPrompt, /no more than six tool calls total/);
	assert.match(reviewer.systemPrompt, /verify only the listed fixes and their immediate regression surface/);
	assert.match(reviewer.systemPrompt, /at most 300 words/);
});

test("resolves bundled, user, then package-local agent directories", () => {
	assert.deepEqual(getAgentDirectories(), [
		BUNDLED_AGENTS_DIR,
		join(process.env.HOME || "", ".pi/agent/agents"),
		join(REPO_ROOT, ".pi/agents"),
	]);
});

test("loads user and package-local agents as full sequential overrides of bundled defaults", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
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
		const bundledDir = BUNDLED_AGENTS_DIR;
		const withoutUserOverrides = loadAgentsFromDirectories([bundledDir, join(tempDir, "missing"), packageLocalDir]);
		const agents = loadAgentsFromDirectories([bundledDir, userDir, packageLocalDir]);
		const byName = new Map(agents.map((agent) => [agent.name, agent]));
		const scout = byName.get("scout");
		const specialist = byName.get("specialist");

		assert.equal(withoutUserOverrides.length, 5);
		assert.equal(withoutUserOverrides.find((agent) => agent.name === "scout")?.description, "Package-local scout");
		assert.equal(agents.length, 6);
		assert.equal(scout?.description, "Package-local scout");
		assert.deepEqual(scout?.tools, ["read"]);
		assert.equal(scout?.model, "openai-codex/gpt-5.5");
		assert.equal(scout?.thinking, "medium");
		assert.equal(scout?.systemPrompt.trim(), "Package-local scout prompt.");
		assert.equal(scout?.filePath, join(packageLocalDir, "scout.md"));
		assert.equal(specialist?.model, undefined);
		assert.equal(specialist?.modelTier, undefined);
		assert.equal(specialist?.thinking, "medium");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("rejects an unknown model tier in agent frontmatter", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
	writeFileSync(join(tempDir, "broken.md"), "---\nname: broken\ndescription: Broken fixture\nmodel_tier: turbo\n---\nBroken\n");

	try {
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Invalid model_tier "turbo" for agent "broken"/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("rejects duplicate agent names within one directory", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
	writeFileSync(join(tempDir, "first.md"), "---\nname: duplicate\ndescription: First fixture\n---\nFirst\n");
	writeFileSync(join(tempDir, "second.md"), "---\nname: duplicate\ndescription: Second fixture\n---\nSecond\n");

	try {
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Duplicate agent name "duplicate"/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("rejects a tool no child process could ever receive", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
	writeFileSync(join(tempDir, "broken.md"), "---\nname: broken\ndescription: Broken fixture\ntools: read, telepathy\n---\nBroken\n");

	try {
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Unknown tool "telepathy" for agent "broken"/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("rejects an agent without a description", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
	writeFileSync(join(tempDir, "blank.md"), "---\nname: blank\ndescription: \"   \"\ntools: read\n---\nBlank\n");
	writeFileSync(join(tempDir, "missing.md"), "---\nname: missing\ntools: read\n---\nMissing\n");

	try {
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Missing description for agent "blank"/,
		);
		rmSync(join(tempDir, "blank.md"));
		assert.throws(
			() => loadAgentsFromDirectories([tempDir]),
			/Missing description for agent "missing"/,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("skips a markdown file without a name and keeps valid siblings", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "jihye-subagents-"));
	writeFileSync(join(tempDir, "README.md"), "# Agents\n\nStray notes, no frontmatter.\n");
	writeFileSync(join(tempDir, "valid.md"), "---\nname: valid\ndescription: Valid fixture\ntools: read, web_search\n---\nValid\n");

	try {
		const agents = loadAgentsFromDirectories([tempDir]);
		assert.deepEqual(agents.map((agent) => agent.name), ["valid"]);
		assert.deepEqual(agents[0]?.tools, ["read", "web_search"]);
		assert.equal(agents[0]?.description, "Valid fixture");
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

/**
 * `SUBAGENT_ALLOWLIST` is read once at module load, so each case needs its own
 * module instance. A distinct query string gives one without touching state
 * shared with the rest of the suite.
 */
async function importDiscoveryWithAllowlist(allowed: string | undefined, cacheKey: string) {
	const previous = process.env.PI_SUBAGENT_ALLOWED;
	if (allowed === undefined) delete process.env.PI_SUBAGENT_ALLOWED;
	else process.env.PI_SUBAGENT_ALLOWED = allowed;
	try {
		return await import(`../extensions/subagent/discovery.ts?allowlist=${cacheKey}`);
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENT_ALLOWED;
		else process.env.PI_SUBAGENT_ALLOWED = previous;
	}
}

test("treats an unset, empty, or whitespace-only allowlist as no restriction", async () => {
	const openCases: Array<string | undefined> = [undefined, "", "   ", " , "];

	for (const [index, value] of openCases.entries()) {
		const discovery = await importDiscoveryWithAllowlist(value, `open-${index}`);
		assert.equal(discovery.SUBAGENT_ALLOWLIST, undefined, `case ${index}`);
		assert.equal(discovery.isAgentAllowed("scout"), true, `case ${index}`);
		assert.equal(discovery.isAgentAllowed("no-such-agent"), true, `case ${index}`);
	}
});

test("applies a set allowlist to both registration and directory scans", async () => {
	const discovery = await importDiscoveryWithAllowlist("scout, reviewer", "scoped");
	const fixture = (name: string): AgentConfig => ({
		name,
		description: `${name} fixture`,
		tools: ["read"],
		thinking: "medium",
		systemPrompt: "Fixture",
		filePath: "<fixture>",
	});

	assert.deepEqual(discovery.SUBAGENT_ALLOWLIST, ["scout", "reviewer"]);
	assert.equal(discovery.isAgentAllowed("scout"), true);
	assert.equal(discovery.isAgentAllowed("engineer"), false);
	assert.equal(discovery.isAgentAllowed("no-such-agent"), false);

	const bundled = loadAgentsFromDirectories([BUNDLED_AGENTS_DIR]);
	assert.deepEqual(
		bundled.filter((agent) => discovery.isAgentAllowed(agent.name)).map((agent) => agent.name).sort(),
		["reviewer", "scout"],
	);

	// A registration that was kept collides on the second attempt; a dropped one never does.
	discovery.registerAgent(fixture("scout"));
	assert.throws(() => discovery.registerAgent(fixture("scout")), /Agent already registered: scout/);
	discovery.registerAgent(fixture("engineer"));
	discovery.registerAgent(fixture("engineer"));
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
		const toolsIndex = built.args.indexOf("--tools");
		assert.notEqual(toolsIndex, -1);
		assert.equal(built.args[toolsIndex + 1], agent.tools.join(","));

		const paths = extensionArgs(built.args);
		const expected = [
			join(REPO_ROOT, "extensions/jihye-setup/index.ts"),
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

test("always loads setup infrastructure without granting tools or tool extensions", async () => {
	const agent: AgentConfig = {
		name: "no-tools",
		description: "Fixture agent without tools",
		tools: [],
		model: "openai-codex/gpt-5.6-sol",
		thinking: "medium",
		systemPrompt: "Test system prompt",
		filePath: "<fixture>",
	};

	let tempDir: string | undefined;
	try {
		const built = await buildPiArgs(agent, "Inspect without tools", REPO_ROOT);
		tempDir = built.tempDir;

		assert.equal(built.args.includes("--no-extensions"), true);
		assert.equal(built.args.includes("--no-tools"), true);
		assert.equal(built.args.includes("--tools"), false);
		assert.deepEqual(extensionArgs(built.args), [
			join(REPO_ROOT, "extensions/jihye-setup/index.ts"),
		]);
	} finally {
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	}
});
