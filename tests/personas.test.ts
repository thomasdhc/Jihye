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
		for (const path of ["GIT.md"]) {
			assert.ok(existsSync(join(policyRoot, path)), path);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("personas include the global and workspace guidance chain", () => {
	for (const path of POLICY_FILES) assert.ok(existsSync(join(PERSONAS_ROOT, path)), path);

	const workspace = readPersona("WORKSPACE.md");
	for (const path of ["REPO.md", "USERNAME.md", "GIT.md"]) {
		assert.match(workspace, new RegExp(`\\b${path.replace(".", "\\.")}\\b`), path);
	}
	assertTerms(workspace, [
		/jihye-setup/i,
		/workspace_directory\/REPO\.md[^\n]*repositories[^\n]*environment activation[^\n]*worktree locations/i,
		/workspace_directory\/USERNAME\.md[^\n]*branch[^\n]*agent commit command[^\n]*handing off a command/i,
		/personas_directory\/GIT\.md[^\n]*before loading repository guidance/i,
		/reusable repository index/i,
		/first tool call/i,
		/nature of the action[^\n]*never its size or obviousness/i,
		/repository guidance may add[^\n]*cannot replace workspace-owned/i,
		/branch identity[^\n]*agent attribution[^\n]*approval[^\n]*publication safeguards/i,
		/report a conflict and ask for resolution/i,
	], "workspace guidance topology");
	assert.doesNotMatch(workspace, /readlink|dirname/, "path resolution belongs to the jihye-setup extension");
});

test("guidance defines the canonical Jihye policy domains", () => {
	const guidance = readFileSync(GUIDANCE_PATH, "utf8");
	assertTerms(guidance, [
		/\*\*main-agent context\*\*\s+—/,
		/\*\*Fidelity\*\*\s+—/,
		/\*\*Principles\*\*\s+—/,
		/\*\*Entrypoint\*\*\s+—/,
		/\*\*Solution Architecture\*\*\s+—/,
		/\*\*Validation\*\*\s+—/,
		/\*\*Context and Delegation\*\*\s+—/,
		/\*\*Safety\*\*\s+—/,
		/downstream personas and skills[^\n]*exact capitalized term/i,
		/## Changing the Base Persona/,
		/JIHYE_strict\.md/,
		/tests\/personas\.test\.ts/,
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
		assert.deepEqual(headings(persona), ["Principles", "Entrypoint", "Solution Architecture", "Validation", "Context and Delegation", "Safety"], path);
		assertTerms(persona, [
			/\bFidelity\b/,
			/established outcome[^\n]*source-of-truth context[^\n]*required behavior/i,
			/alternatives and trade-offs/i,
			/narrowest relevant check/i,
			/checks that could not run/i,
			/never expose or commit secrets, credentials/i,
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

test("guidance never passes a policy domain", () => {
	const skillRoot = join(REPO_ROOT, "skills");
	const files = [
		GUIDANCE_PATH,
		...POLICY_FILES.map((path) => join(PERSONAS_ROOT, path)),
		...readdirSync(join(PERSONAS_ROOT, "subagents")).map((entry) => join(PERSONAS_ROOT, "subagents", entry)),
		...readdirSync(skillRoot).map((entry) => join(skillRoot, entry, "SKILL.md")),
	].filter((path) => existsSync(path) && path.endsWith(".md"));

	for (const path of files) {
		assert.doesNotMatch(
			readFileSync(path, "utf8"),
			/\bPass(?:es|ing)?\s+(?:Fidelity|Principles|Entrypoint|Solution Architecture|Validation|Context and Delegation|Safety)\b/,
			`${path}: apply a domain, pass a gate`,
		);
	}
});

test("downstream personas invoke canonical main-agent domains", () => {
	assertTerms(readPersona("GIT.md"), [/\bValidation\b/], "Git policy domains");
	assertTerms(readFileSync(join(PERSONAS_ROOT, "subagents", "engineer.md"), "utf8"), [/\bFidelity\b/, /\bPrinciples\b/, /\bSolution Architecture\b/], "engineer policy domains");
});

test("git guidance preserves delivery and pull-request invariants", () => {
	const git = readPersona("GIT.md");
	assert.deepEqual(headings(git), ["Safety and Branching", "Staging, Commits, and Pushing", "Commit Messages", "Merge Requests and Pull Requests"]);
	assertTerms(git, [
		/approval gate/i,
		/delivery boundar/i,
		/implementation, tests, and supporting documentation/i,
		/Conventional Commit/i,
		/request template/i,
		/headings and checklists/i,
		/explicitly requests/i,
		/never push/i,
		/cleanup candidate/i,
		/never infer staleness from age alone/i,
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
