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
		"dokhae",
		"examen",
		"hakseup",
		"review-guidance",
		"session-digest",
		"todo",
		"translate-guidance",
		"vicara",
	]);
});

test("coordinate preserves its execution-skeleton algorithm", () => {
	const content = readFileSync(join(SKILLS_ROOT, "coordinate", "SKILL.md"), "utf8");
	assert.deepEqual(headings(content), ["Build the Execution Skeleton", "Run the Skeleton"]);
	assertTerms(content, [
		/Context and Delegation/,
		/main-agent context/i,
		/depth and breadth/i,
		/acceptance invariant/i,
		/delivery boundar/i,
		/safe parallel/i,
		/worktree isolation/i,
		/approval or read gate/i,
		/integration and validation/i,
		/first actionable parallel group/i,
		/single delegated call/i,
	], "coordinate semantics");
	assert.doesNotMatch(content, /\bcoordinator\b/i);
	assert.doesNotMatch(content, /\bskip\b/i, "coordinate must exempt no delegation from the skeleton");
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
		/`reviewer` subagent/,
		/references\/platforms\.md/,
	], "examen semantics");
	assert.match(content, /```markdown\n\[P2\] <[^>\n]*title[^>\n]*>\n\nFindings: <[^\n]+>\n\nProposal: <[^\n]+>\n```/, "inline finding contract");
	assert.match(content, /```markdown\n### \[P2\] <[^>\n]*title[^>\n]*>\n\*\*`path\/to\/file:line`\*\*\n\nFindings: <[^\n]+>\n\nProposal: <[^\n]+>\n```/, "draft finding contract");
	assert.match(content, /blank line/i, "inline block separation");
	assert.match(content, /no more than two clauses/i, "inline sentence clause limit");
	assert.match(content, /run-on sentence/i, "inline sentence readability");
	assert.doesNotMatch(content, /\[P2\] Findings:[^\n]*Proposal:/, "legacy single-line inline format");
});

test("vicara preserves evidence gates and resumable reporting", () => {
	const content = readFileSync(join(SKILLS_ROOT, "vicara", "SKILL.md"), "utf8");
	for (const section of ["Resume the Investigation", "Map and Investigate", "Apply the Finding Gate", "Rank and Update the Report", "Return"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/\bSolution Architecture\b/,
		/`scout` or `researcher` subagent/,
		/finding gate/i,
		/decisive support/i,
		/`reviewer` subagent/,
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
		/Pi's same-directory precedence/i,
		/translate-guidance` freshness check/i,
		/companion metadata/i,
		/local delta/i,
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

test("hakseup preserves learner-first surfacing and retention semantics", () => {
	const content = readFileSync(join(SKILLS_ROOT, "hakseup", "SKILL.md"), "utf8");
	for (const section of ["Preserve the Teaching Invariants", "Locate the Course", "Scope the Curriculum", "Run the Task Loop", "Calibrate Difficulty", "Capture Notes and Feedback", "Generate and Run the Review Test", "Deliver the Course Record"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/signature, docstring, and check block alone/i,
		/never name the concept, list traps, preview failure modes/i,
		/explain after the attempt, never before/i,
		/never write an implementation into the learner's working file/i,
		/discard the reference solution/i,
		/acceptance invariants/i,
		/finding gate/i,
		/applying Validation to the attempt/,
		/prompt boundary/i,
		/read gate/i,
		/one tier per request/i,
		/third hint tier/i,
		/at least one input the check block does not cover/i,
		/advance only when the learner says so/i,
		/never reuse a check block the learner has already passed/i,
		/references\/course\.md/,
		/resolve the course home rather than assuming one/i,
		/workspace-owned configuration/i,
		/never hardcode a course home/i,
		/only from code read in this session/i,
		/per-module choice, not a course-wide setting/i,
		/`scout` subagent/,
		/record the cited evidence in that module's `sources\.md`/,
		/keep it out of `notes\.md`/i,
		/a module is initialized and its first task is surfaced/i,
		/a module completes and its review test exists/i,
		/the learner pauses, ends a sitting, or asks to stop/i,
		/carry every checkpoint through to the pull request/i,
		/no checkpoint waits for a later checkpoint to deliver it/i,
		/delivery boundary in the course home's repository/i,
		/apply the workspace Git workflow/i,
	], "hakseup semantics");
	assert.doesNotMatch(content, /git (checkout|commit|push) |<username>\//i, "hakseup must not restate workspace-owned Git mechanics");
	assert.doesNotMatch(content, /\bpython\b/i, "hakseup must stay subject-agnostic");
	assert.doesNotMatch(content, /\bEtude\b/i, "hakseup must not name a configured course home");
	assert.doesNotMatch(content, /\blearnings\/\B/i, "hakseup must not hardcode a course directory");

	const coursePath = join(SKILLS_ROOT, "hakseup", "references", "course.md");
	assert.ok(existsSync(coursePath));
	const course = readFileSync(coursePath, "utf8");
	for (const file of ["CURRICULUM.md", "notes.md", "learner.md"]) {
		assert.match(course, new RegExp(`^## ${file.replace(".", "\\.")}$`, "m"), `course: ${file}`);
	}
	for (const file of ["problems.md", "sources.md"]) {
		assert.match(course, new RegExp(`^## module-\\\\<n\\\\>/${file.replace(".", "\\.")}$`, "m"), `course: module-<n>/${file}`);
	}
	assert.match(course, /^## module-\\<n\\>\/review-test\./m, "course: module-<n>/review-test");
	assert.match(course, /a course adopts `module-<n>\/` when it reaches its second\s+module/i, "course: module adoption rule");
});

test("dokhae preserves source-first critical-reading and lineage semantics", () => {
	const content = readFileSync(join(SKILLS_ROOT, "dokhae", "SKILL.md"), "utf8");
	for (const section of ["Preserve the Reading Invariants", "Locate the Track", "Scope the Track", "Run the Reading Loop", "Maintain the Queue", "Capture Notes and Lineage", "Deliver the Track Record"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/read the primary source directly and in full/i,
		/never review a source from a summary, an abstract, a citation, or recall/i,
		/before objecting to it/i,
		/finding gate/i,
		/decays into an assertion/i,
		/never inherit a citation's characterization/i,
		/name the date the score is taken/i,
		/never resolve a queue item from recall/i,
		/conversation[^\n]*transient/i,
		/prompt boundary/i,
		/read gate/i,
		/references\/track\.md/,
		/resolve the reading home rather than assuming one/i,
		/workspace-owned configuration/i,
		/never hardcode a reading home/i,
		/numbered globally|number its sections globally/i,
		/never delete a closed item/i,
		/advance only on the reader's explicit signal/i,
		/carry every checkpoint through to the pull request/i,
		/no checkpoint waits for a later checkpoint to deliver it/i,
		/delivery boundary in the reading home's repository/i,
		/apply the workspace Git workflow/i,
	], "dokhae semantics");
	assert.doesNotMatch(content, /git (checkout|commit|push) |<username>\//i, "dokhae must not restate workspace-owned Git mechanics");
	assert.doesNotMatch(content, /\bEtude\b/i, "dokhae must not name a configured reading home");
	assert.doesNotMatch(content, /\blearnings\/\B/i, "dokhae must not hardcode a reading directory");

	const trackPath = join(SKILLS_ROOT, "dokhae", "references", "track.md");
	assert.ok(existsSync(trackPath));
	const track = readFileSync(trackPath, "utf8");
	for (const file of ["TRACK.md", "notes.md", "queue.md"]) {
		assert.match(track, new RegExp(`^## ${file.replace(".", "\\.")}$`, "m"), `track: ${file}`);
	}
});

test("translate-guidance keeps the projection a pointer plus a local delta", () => {
	const content = readFileSync(join(SKILLS_ROOT, "translate-guidance", "SKILL.md"), "utf8");
	for (const section of [
		"Establish the Target and Operation",
		"Resolve the Guidance Topology",
		"Use the Managed Format",
		"Initialize the Projection",
		"Check Freshness",
		"Refresh the Delta",
		"Enrich or Compact",
		"Propose Upstream",
		"Return the Result",
	]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/AGENTS\.override\.md/,
		/linked worktree/i,
		/instruction boundary/i,
		/fidelity floor/i,
		/precedence/i,
		/git rev-parse --git-path info\/exclude/,
		/git check-ignore -v/,
		/\.jihye\/AGENTS\.override\.md\.json/,
		/translate-guidance\/v1/,
		/"state":"current"/,
		/`review-required`/,
		/approval gate/i,
		/`\/reload`/,
		/no projection is warranted/i,
		/ancestors/i,
		/cannot reach/i,
		/inside the target repository/i,
	], "translate-guidance semantics");
	assert.match(content, /^## Owner Guidance$/m, "the projection body leads with a pointer to owner guidance");
	assert.doesNotMatch(content, /^## Owner Requirements$/m, "the projection points at owner guidance instead of restating it");
	assert.doesNotMatch(content, /contractSha256|doctrineSha256|ownerTopologySha256/, "the companion drops self-referential and topology fingerprints");
	assert.doesNotMatch(content, /\d+\.\d+\.\d+|piMin/, "the workflow pins no configured version");
});

test("todo preserves durable planning and local-first handoff semantics", () => {
	const content = readFileSync(join(SKILLS_ROOT, "todo", "SKILL.md"), "utf8");
	for (const section of ["Preserve the Planning Invariants", "Locate the Planning System", "Choose the Context Depth", "Apply the Resume Test", "Perform the Operation", "Promote a Planning Record"]) {
		assert.ok(headings(content).includes(section), section);
	}
	assertTerms(content, [
		/conversation[^\n]*transient/i,
		/configured local todo system/i,
		/explicit user request/i,
		/acceptance invariants/i,
		/todo\/plans\/<repo-slug>\/<topic>\.md/i,
		/todo\/done\/plans\/<repo-slug>\/<topic>\.md/i,
		/developed workstream/i,
		/session-digest/i,
		/conversation is unavailable/i,
		/next independently finishable outcome/i,
		/archive link[^\n]*plan move[^\n]*default mirrored layout/i,
	], "todo planning semantics");
});

test("session-digest preserves todo-local planning by default", () => {
	const content = readFileSync(join(SKILLS_ROOT, "session-digest", "SKILL.md"), "utf8");
	assertTerms(content, [
		/canonical local todo registry/i,
		/todo\/plans\/<repo-slug>\/.*-session\.md/i,
		/todo workflow[^\n]*todo-local destination/i,
		/repository promotion remains explicit/i,
	], "session-digest planning boundary");
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
