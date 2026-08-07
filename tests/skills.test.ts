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
	assert.deepEqual(names.sort(), ["examen", "pdf-reader", "session-digest", "todo", "ui-edit", "vicara"]);
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
