import assert from "node:assert/strict";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PERSONAS_ROOT = join(REPO_ROOT, "personas");

const POLICY_FILES = [
	"JIHYE.md",
	"JIHYE_strict.md",
	"WORKSPACE.md",
	"DEVELOPMENT.md",
	"GIT.md",
	"README.md",
	"templates/REPO.md",
	"templates/USERNAME.md",
];

function readPersona(path: string): string {
	return readFileSync(join(PERSONAS_ROOT, path), "utf8");
}

test("the two-link installation resolves the complete policy topology", () => {
	const root = mkdtempSync(join(tmpdir(), "jihye-personas-"));
	const agentDir = join(root, "home", ".pi", "agent");
	const workspaceRoot = join(root, "workspace");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(workspaceRoot);

	try {
		const globalContext = join(agentDir, "AGENTS.md");
		const workspaceContext = join(workspaceRoot, "AGENTS.md");
		symlinkSync(join(PERSONAS_ROOT, "JIHYE.md"), globalContext);
		symlinkSync(join(PERSONAS_ROOT, "WORKSPACE.md"), workspaceContext);

		assert.equal(realpathSync(globalContext), join(PERSONAS_ROOT, "JIHYE.md"));
		assert.equal(realpathSync(workspaceContext), join(PERSONAS_ROOT, "WORKSPACE.md"));

		const policyRoot = dirname(realpathSync(workspaceContext));
		for (const path of ["DEVELOPMENT.md", "GIT.md"]) {
			assert.ok(existsSync(join(policyRoot, path)), path);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("personas include the global and workspace guidance chain", () => {
	for (const path of POLICY_FILES) assert.ok(existsSync(join(PERSONAS_ROOT, path)), path);

	assert.match(readPersona("JIHYE_strict.md"), /ASK FOR EXPLICIT APPROVAL BEFORE EDIT OR WRITE/);

	const workspace = readPersona("WORKSPACE.md");
	for (const path of ["REPO.md", "USERNAME.md", "DEVELOPMENT.md", "GIT.md"]) {
		assert.match(workspace, new RegExp(`\\b${path.replace(".", "\\.")}\\b`), path);
	}
	assert.match(workspace, /jihye-setup.*resolves `workspace_directory` and `personas_directory`/);
	assert.doesNotMatch(workspace, /readlink|dirname/, "path resolution belongs to the jihye-setup extension");
	assert.match(workspace, /workspace_directory.*machine- and workspace-specific configuration/is);
	assert.match(workspace, /personas_directory.*reusable workflow guidance/is);
	assert.match(workspace, /REPO\.md.*source of truth for environment-specific values/i);
	assert.match(workspace, /Begin each independent shell invocation with the configured environment activation command/i);
	assert.match(workspace, /mandatory gates, not references/, "guidance reads are gates rather than optional references");
	assert.match(workspace, /before the first tool call that touches the target/);
	assert.doesNotMatch(workspace, /planning repository code/, "the development gate covers every repository file, not only code");
});

test("global personas require complexity-aware delegation planning", () => {
	for (const path of ["JIHYE.md", "JIHYE_strict.md"]) {
		const persona = readPersona(path);
		assert.match(persona, /Before the first subagent call, evaluate delegation complexity/);
		assert.match(persona, /multiple agent calls, parallel execution, or non-trivial sequencing/);
		assert.match(persona, /Treat a coordinator plan as a skeleton to verify and adapt/);
	}
});

test("merge requests and pull requests use strict title and description defaults", () => {
	const git = readPersona("GIT.md");
	assert.match(git, /Use Conventional Commit format for every merge request and pull request title/);
	assert.match(git, /Do not use a plain prose title unless the user explicitly requests it/);
	assert.match(git, /show its headings and checklists to the user/);
	assert.match(git, /When no repository template exists, use only:/);
	assert.match(git, /Do not add other headings, checklists, validation notes, or supporting sections unless the user explicitly requests them/);
});

test("persona policy remains portable", () => {
	for (const path of POLICY_FILES) {
		const content = readPersona(path);
		assert.doesNotMatch(content, /\/(?:Users|home)\/[^\s`]+/, path);
		assert.doesNotMatch(content, /repo\/personas/, path);
		assert.doesNotMatch(content, /pi-extensio/, path);
	}
});

test("persona agents are the single current bundled definition set", () => {
	const agentRoot = join(PERSONAS_ROOT, "subagents");
	const files = readdirSync(agentRoot).filter((entry) => entry.endsWith(".md")).sort();
	assert.deepEqual(files, ["coordinator.md", "engineer.md", "researcher.md", "reviewer.md", "scout.md"]);
	assert.equal(lstatSync(agentRoot).isSymbolicLink(), false);
	assert.equal(existsSync(join(REPO_ROOT, "agents")), false);
	assert.equal(existsSync(join(PERSONAS_ROOT, "agents")), false);
	assert.equal(existsSync(join(PERSONAS_ROOT, "subagent")), false);

	for (const file of files) {
		assert.equal(lstatSync(join(agentRoot, file)).isSymbolicLink(), false);
		const content = readFileSync(join(agentRoot, file), "utf8");
		assert.match(content, /^model_tier: (standard|deep)$/m);
		assert.doesNotMatch(content, /^model: /m);
	}
	assert.match(readFileSync(join(agentRoot, "engineer.md"), "utf8"), /thinking: high/);
});
