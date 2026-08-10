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

test("coordinate conducts complex delegation without a planning-only handoff", () => {
	const content = readFileSync(join(SKILLS_ROOT, "coordinate", "SKILL.md"), "utf8");
	const description = content.match(/^description: (.+)$/m)?.[1] ?? "";

	assert.match(description, /multi-stream or dependency-heavy work/);
	assert.match(description, /multiple subagent calls require decisions about dependencies, delivery boundaries, safe parallelism/);
	assert.match(description, /Skip one bounded task and obvious independent direct fan-out/);
	assert.match(content, /Outcomes and delivery boundaries/);
	assert.match(content, /Keep separate outcomes on separate branch, worktree, and pull-request boundaries/);
	assert.match(content, /keep one outcome's implementation, tests, and supporting documentation together/);
	assert.match(content, /Likely calls/);
	assert.match(content, /Dependencies/);
	assert.match(content, /Safe parallel groups/);
	assert.match(content, /Shared files and resources/);
	assert.match(content, /Worktree isolation/);
	assert.match(content, /Approval gates/);
	assert.match(content, /Integration and validation/);
	assert.match(content, /Immediately after identifying the skeleton, launch the first actionable parallel group in the same turn/);
	assert.match(content, /The parent agent conducts the work/);
	assert.doesNotMatch(content, /\bcoordinator\b/i);
});

test("vicara uses parent-led coordination", () => {
	const content = readFileSync(join(SKILLS_ROOT, "vicara", "SKILL.md"), "utf8");
	assert.match(content, /load and follow the `coordinate` skill before the first subagent call/);
	assert.match(content, /build the execution skeleton in the calling agent's context/);
	assert.match(content, /immediately launch its first actionable group/);
	assert.doesNotMatch(content, /\bcoordinator\b/i);
});

test("review-guidance requires a narrow subject scope", () => {
	const content = readFileSync(join(SKILLS_ROOT, "review-guidance", "SKILL.md"), "utf8");
	assert.match(content, /scope is required/i);
	assert.match(content, /most-specific guidance/i);
	assert.match(content, /parent guidance files are references/i);
	assert.match(content, /Do not review unrelated Markdown files/i);
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
