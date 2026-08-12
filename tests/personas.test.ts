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
const GUIDANCE_PATH = join(REPO_ROOT, "GUIDANCE.md");

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

function headings(content: string): string[] {
	const prose = content.replace(/```[\s\S]*?```/g, "");
	return [...prose.matchAll(/^##+\s+(.+)$/gm)].map((match) => match[1]!);
}

function assertTerms(content: string, terms: RegExp[], subject: string): void {
	for (const term of terms) assert.match(content, term, `${subject}: ${term}`);
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

	const workspace = readPersona("WORKSPACE.md");
	for (const path of ["REPO.md", "USERNAME.md", "DEVELOPMENT.md", "GIT.md"]) {
		assert.match(workspace, new RegExp(`\\b${path.replace(".", "\\.")}\\b`), path);
	}
	assertTerms(workspace, [
		/jihye-setup/i,
		/configuration(?:(?!personas_directory)[^\n])*workspace_directory/i,
		/guidance(?:(?!workspace_directory)[^\n])*personas_directory/i,
		/REPO\.md[\s\S]*source of truth/i,
		/activation command/i,
		/read gate/i,
		/first tool call/i,
	], "workspace guidance topology");
	assert.doesNotMatch(workspace, /readlink|dirname/, "path resolution belongs to the jihye-setup extension");
	assert.doesNotMatch(workspace, /planning repository code/, "the development gate covers every repository file, not only code");
});

test("guidance defines the canonical Jihye policy domains", () => {
	const guidance = readFileSync(GUIDANCE_PATH, "utf8");
	assertTerms(guidance, [
		/\*\*main-agent context\*\*\s+—/,
		/\*\*Fidelity\*\*\s+—/,
		/\*\*Entrypoint\*\*\s+—/,
		/\*\*Solution Architecture\*\*\s+—/,
		/\*\*Context and Delegation\*\*\s+—/,
		/\*\*Safety\*\*\s+—/,
		/downstream personas and skills[^\n]*exact capitalized term/i,
	], "canonical Jihye vocabulary");
});

test("strict persona is the base persona plus its approval header", () => {
	const baseBody = readPersona("JIHYE.md").replace(/^# Jihye\n\n/, "");
	const strict = readPersona("JIHYE_strict.md");
	const match = strict.match(
		/^# Jihye — Strict\n\n(?<header>- [^\n]*EXPLICIT APPROVAL[^\n]*\n)\n(?<body>[\s\S]*)$/,
	);

	assert.ok(match?.groups, "strict persona must contain one approval header");
	assert.equal(match.groups.body, baseBody);
});

test("global personas preserve canonical domains, coordination gates, and parent ownership", () => {
	for (const path of ["JIHYE.md", "JIHYE_strict.md"]) {
		const persona = readPersona(path);
		assert.deepEqual(headings(persona), ["Fidelity", "Entrypoint", "Solution Architecture", "Context and Delegation", "Safety"], path);
		assertTerms(persona, [
			/alternatives and trade-offs/i,
			/copy the exact paste-ready command to the local clipboard[^\n]*display the identical command/i,
			/never copy protected data/i,
			/main-agent context[^\n]*decisions[^\n]*decisive evidence[^\n]*synthesis/i,
			/raw logs[^\n]*repetitive responses[^\n]*exploratory dead ends/i,
			/coordinate.*skill/is,
			/before the first subagent call/i,
			/delivery boundar/i,
			/safe parallel/i,
			/first actionable parallel group/i,
			/ownership/i,
			/integration/i,
			/validation/i,
			/final synthesis/i,
		], path);
		assert.doesNotMatch(persona, /\bcoordinator\b/);
	}
});

test("downstream personas invoke canonical main-agent domains", () => {
	assertTerms(readPersona("WORKSPACE.md"), [
		/main-agent context/i,
		/\bFidelity\b/,
		/\bEntrypoint\b/,
		/\bSolution Architecture\b/,
		/\bContext and Delegation\b/,
		/\bSafety\b/,
	], "workspace policy domains");
	assertTerms(readPersona("DEVELOPMENT.md"), [/\bEntrypoint\b/, /\bSolution Architecture\b/], "development policy domains");
	assertTerms(readPersona("GIT.md"), [/\bFidelity\b/, /\bEntrypoint\b/], "Git policy domains");
	assertTerms(readFileSync(join(PERSONAS_ROOT, "subagents", "engineer.md"), "utf8"), [/\bFidelity\b/, /\bSolution Architecture\b/], "engineer policy domains");
});

test("git guidance preserves delivery and pull-request invariants", () => {
	const git = readPersona("GIT.md");
	assert.deepEqual(headings(git), ["Safety and Branching", "Staging, Commits, and Pushing", "Commit Messages", "Merge Requests and Pull Requests"]);
	assertTerms(git, [
		/delivery boundar/i,
		/implementation, tests, and supporting documentation/i,
		/Conventional Commit/i,
		/request template/i,
		/headings and checklists/i,
		/explicitly requests/i,
		/never push/i,
		/2\.82\.1/,
	], "git workflow invariants");
	assert.match(git, /## Summary[\s\S]*## Why/, "default request description keeps only its semantic sections");
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
	assert.deepEqual(files, ["engineer.md", "researcher.md", "reviewer.md", "scout.md"]);
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
	const reviewer = readFileSync(join(agentRoot, "reviewer.md"), "utf8");
	assert.match(reviewer, /^alternate_model_tier: deep$/m);
	assert.match(reviewer, /^provider_strategy: alternate$/m);
	for (const file of ["engineer.md", "researcher.md", "scout.md"]) {
		const content = readFileSync(join(agentRoot, file), "utf8");
		assert.doesNotMatch(content, /^alternate_model_tier:/m);
		assert.doesNotMatch(content, /^provider_strategy:/m);
	}
	assert.match(readFileSync(join(agentRoot, "engineer.md"), "utf8"), /thinking: high/);
});
