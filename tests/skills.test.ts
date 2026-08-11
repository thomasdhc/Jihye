import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("coordinate preserves execution-skeleton and ownership semantics", () => {
	const content = readFileSync(join(SKILLS_ROOT, "coordinate", "SKILL.md"), "utf8");
	assert.deepEqual(headings(content), ["Decide Whether to Coordinate", "Build the Execution Skeleton", "Start the First Group", "Keep Parent Ownership"]);
	assertTerms(content, [
		/acceptance invariant/i,
		/delivery boundar/i,
		/safe parallel/i,
		/worktree isolation/i,
		/approval gate/i,
		/integration and validation/i,
		/first actionable parallel group/i,
		/ownership/i,
		/final synthesis/i,
	], "coordinate semantics");
	assert.match(content, /branch[\s\S]*worktree[\s\S]*pull request/i, "delivery boundary spans all Git surfaces");
	assert.doesNotMatch(content, /\bcoordinator\b/i);
});

test("vicara preserves evidence gates, parent ownership, and resumable reporting", () => {
	const content = readFileSync(join(SKILLS_ROOT, "vicara", "SKILL.md"), "utf8");
	for (const section of ["Set the Prompt Boundary and Report", "Keep Ownership and Delegate Bounded Work", "Apply the Finding Gates", "Rank and Update"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/coordinate.*skill/is,
		/finding gate/i,
		/ownership/i,
		/decisive evidence/i,
		/Frontier/,
		/Needs More Investigation/,
		/approval gate/i,
	], "vicara semantics");
	assert.doesNotMatch(content, /\bcoordinator\b/i);
});

test("review-guidance preserves a narrow subject and evidence threshold", () => {
	const content = readFileSync(join(SKILLS_ROOT, "review-guidance", "SKILL.md"), "utf8");
	for (const section of ["Set the Prompt Boundary", "Resolve the Subject and Instruction Boundary", "Apply the Finding Gate", "Return the Verdict"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/most-specific guidance/i,
		/parent guidance files are references/i,
		/finding gate/i,
		/ownership/i,
		/verdict/i,
		/approval gate/i,
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
