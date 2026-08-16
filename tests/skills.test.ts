import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager } from "@earendil-works/pi-coding-agent";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_ROOT = join(REPO_ROOT, "skills");

function skillFiles(directory = SKILLS_ROOT): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) files.push(...skillFiles(path));
		else if (entry === "SKILL.md") files.push(path);
	}
	return files;
}

function headings(content: string): string[] {
	const prose = content.replace(/```[\s\S]*?```/g, "");
	return [...prose.matchAll(/^##+\s+(.+)$/gm)].map((match) => match[1]!);
}

function assertTerms(content: string, terms: RegExp[], subject: string): void {
	for (const term of terms) assert.match(content, term, `${subject}: ${term}`);
}

test("skill documentation is excluded from package skill discovery", async () => {
	const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
	assert.ok(existsSync(join(SKILLS_ROOT, "README.md")));
	assert.deepEqual(packageJson.pi?.skills, ["./skills", "!skills/README.md"]);

	const packageManager = new DefaultPackageManager({
		cwd: REPO_ROOT,
		agentDir: join(REPO_ROOT, "tmp", "test-agent"),
		settingsManager: {} as never,
	});
	const resources = await packageManager.resolveExtensionSources([REPO_ROOT], { temporary: true });
	assert.deepEqual(
		resources.skills.map(({ path }) => relative(SKILLS_ROOT, path)).sort(),
		skillFiles().map((path) => relative(SKILLS_ROOT, path)).sort(),
	);
});

test("skills have valid identifying frontmatter", () => {
	const names: string[] = [];
	for (const path of skillFiles()) {
		const content = readFileSync(path, "utf8");
		const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
		assert.ok(frontmatter, path);
		assert.match(frontmatter, /^name: [a-z0-9-]+$/m, path);
		assert.match(frontmatter, /^description: .+$/m, path);
		names.push(frontmatter.match(/^name: ([a-z0-9-]+)$/m)?.[1] ?? "");
	}
	assert.deepEqual(names.sort(), [
		"coordinate",
		"examen",
		"review-guidance",
		"session-digest",
		"todo",
		"vicara",
	]);
});

test("coordinate preserves its execution-skeleton algorithm", () => {
	const content = readFileSync(join(SKILLS_ROOT, "coordinate", "SKILL.md"), "utf8");
	assert.deepEqual(headings(content), ["Build the Execution Skeleton", "Run the Skeleton"]);
	assertTerms(content, [
		/Context and Delegation/,
		/main-agent context/i,
		/acceptance invariant/i,
		/delivery boundar/i,
		/safe parallel/i,
		/worktree isolation/i,
		/approval or read gate/i,
		/integration and validation/i,
		/first actionable parallel group/i,
	], "coordinate semantics");
	assert.doesNotMatch(content, /\bcoordinator\b/i);
});

test("examen preserves introduced-defect and submission semantics", () => {
	const content = readFileSync(join(SKILLS_ROOT, "examen", "SKILL.md"), "utf8");
	for (const section of ["Review the Target", "Apply the Finding Gate", "Assign Priority and Verdict", "Return the Draft", "Submit and Verify"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/\bFidelity\b/,
		/\bPrinciples\b/,
		/\bEntrypoint\b/,
		/\bSafety\b/,
		/introduced regression/i,
		/realistic event, input, configuration, or caller/i,
		/\[P0\]/,
		/\[P1\]/,
		/\[P2\]/,
		/\[P3\]/,
		/current head SHA/i,
		/references\/platforms\.md/,
	], "examen semantics");
	assert.match(content, /\[P2\] Findings:[^\n]*Proposal:/, "inline finding contract");
});

test("vicara preserves evidence gates and resumable reporting", () => {
	const content = readFileSync(join(SKILLS_ROOT, "vicara", "SKILL.md"), "utf8");
	for (const section of ["Resume the Investigation", "Map and Investigate", "Apply the Finding Gate", "Rank and Update the Report", "Return"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/\bSolution Architecture\b/,
		/follow the `coordinate` skill/i,
		/finding gate/i,
		/decisive support/i,
		/reviewer challenge/i,
		/Frontier/,
		/Needs More Investigation/,
		/references\/report\.md/,
	], "vicara semantics");
	assert.doesNotMatch(content, /\bcoordinator\b/i);

	const reportPath = join(SKILLS_ROOT, "vicara", "references", "report.md");
	assert.ok(existsSync(reportPath));
	const report = readFileSync(reportPath, "utf8");
	for (const section of ["Destination", "Repo Snapshot", "Frontier", "Opportunities", "Needs More Investigation", "Out of Scope", "Session Notes"]) {
		assert.match(report, new RegExp(`^## ${section}$`, "m"), `report: ${section}`);
	}
});

test("review-guidance preserves a narrow subject and evidence threshold", () => {
	const content = readFileSync(join(SKILLS_ROOT, "review-guidance", "SKILL.md"), "utf8");
	for (const section of ["Resolve the Subject and Instruction Boundary", "Inspect the Subject", "Apply the Finding Gate", "Return the Verdict"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/most-specific governing guidance/i,
		/parent guidance files as references/i,
		/instruction boundary/i,
		/blueprint guidance/i,
		/blueprint coherence/i,
		/implementation evidence/i,
		/durable context/i,
		/scope-specific delta/i,
		/finding gate/i,
		/verdict/i,
		/remains read-only/i,
	], "review-guidance semantics");
	assert.match(content, /do not[^\n]*unrelated Markdown/i, "review scope excludes unrelated documentation");
});

test("skills remain portable and never instruct autonomous commits", () => {
	for (const path of skillFiles()) {
		const content = readFileSync(path, "utf8");
		assert.doesNotMatch(content, /~\/\.pi\/agent\/skills\//, path);
		assert.doesNotMatch(content, /\/(?:Users|home)\/[^\s`]+/, path);
		assert.doesNotMatch(content, /\bgit\s+commit\b/i, path);
		assert.doesNotMatch(content, /\balways commit\b/i, path);
	}
});
