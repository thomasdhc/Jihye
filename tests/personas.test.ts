import assert from "node:assert/strict";
import {
	existsSync,
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
	"ENVIRONMENT.md",
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
		for (const path of ["DEVELOPMENT.md", "ENVIRONMENT.md", "GIT.md"]) {
			assert.ok(existsSync(join(policyRoot, path)), path);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("personas include the global and workspace guidance chain", () => {
	for (const path of POLICY_FILES) assert.ok(existsSync(join(PERSONAS_ROOT, path)), path);

	assert.match(readPersona("JIHYE.md"), /workspace profile is `WORKSPACE\.md` beside this file/);
	assert.match(readPersona("JIHYE_strict.md"), /ASK FOR EXPLICIT APPROVAL BEFORE EDIT OR WRITE/);

	const workspace = readPersona("WORKSPACE.md");
	for (const path of ["REPO.md", "USERNAME.md", "ENVIRONMENT.md", "DEVELOPMENT.md", "GIT.md"]) {
		assert.match(workspace, new RegExp(`\\b${path.replace(".", "\\.")}\\b`), path);
	}
	assert.match(workspace, /canonical target/);
});

test("persona policy remains portable", () => {
	for (const path of POLICY_FILES) {
		const content = readPersona(path);
		assert.doesNotMatch(content, /\/(?:Users|home)\/[^\s`]+/, path);
		assert.doesNotMatch(content, /repo\/personas/, path);
		assert.doesNotMatch(content, /pi-extensio/, path);
	}
});

test("portable persona subagents are retained but current", () => {
	const subagentRoot = join(PERSONAS_ROOT, "subagent");
	const files = readdirSync(subagentRoot).filter((entry) => entry.endsWith(".md")).sort();
	assert.deepEqual(files, ["researcher.md", "reviewer.md", "scout.md", "worker.md"]);

	for (const file of files) {
		const content = readFileSync(join(subagentRoot, file), "utf8");
		assert.match(content, /model: openai-codex\/gpt-5\.6-sol/);
	}
	assert.match(readFileSync(join(subagentRoot, "worker.md"), "utf8"), /thinking: high/);
});
