import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");

// Exercise the published commands, changing only their workstation placeholders.
const MIGRATION_SCRIPT = CHANGELOG.split("## 0.11.0\n")[1]!.split("\n## ")[0]!.match(/```bash\n([\s\S]*?)```/)![1]!
	.replace(/^JIHYE=.*\n/m, "")
	.replace(/^WORKSPACE=.*\n/m, "");

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "jihye-changelog-"));
	const packageRoot = join(root, "package with spaces");
	const guidanceRoot = join(packageRoot, "guidance");
	const agentRoot = join(root, "custom agent");
	const workspaceRoot = join(root, "workspace");
	for (const directory of [guidanceRoot, agentRoot, workspaceRoot]) mkdirSync(directory, { recursive: true });
	writeFileSync(join(guidanceRoot, "JIHYE.md"), "# Jihye\n");
	writeFileSync(join(guidanceRoot, "WORKSPACE.md"), "# Workspace\n");
	writeFileSync(join(workspaceRoot, "REPO.md"), "Local repositories\n");
	writeFileSync(join(workspaceRoot, "USERNAME.md"), "Local identity\n");
	const links = [
		{ destination: join(agentRoot, "AGENTS.md"), profile: "JIHYE.md" },
		{ destination: join(workspaceRoot, "AGENTS.md"), profile: "WORKSPACE.md" },
	];
	return {
		packageRoot,
		guidanceRoot,
		workspaceRoot,
		links,
		run: () => spawnSync("bash", ["-c", MIGRATION_SCRIPT], {
			env: { ...process.env, JIHYE: packageRoot, WORKSPACE: workspaceRoot, PI_CODING_AGENT_DIR: agentRoot },
			encoding: "utf8",
		}),
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("the current package version has the newest changelog entry and a maintenance rule", () => {
	const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
	const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8"));
	assert.equal(CHANGELOG.match(/^## (\d+\.\d+\.\d+)$/m)?.[1], manifest.version);
	assert.equal(lockfile.version, manifest.version);
	assert.equal(lockfile.packages[""].version, manifest.version);
	assert.match(readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8"), /Update `CHANGELOG\.md` whenever the package version changes/);
});

test("the documented migration replaces dangling legacy links and preserves local configuration", () => {
	const fixture = createFixture();
	try {
		for (const link of fixture.links) {
			symlinkSync(join(fixture.packageRoot, "personas", link.profile), link.destination);
		}
		const result = fixture.run();
		assert.equal(result.status, 0, result.stderr);
		for (const link of fixture.links) {
			assert.equal(readlinkSync(link.destination), join(fixture.guidanceRoot, link.profile));
		}
		assert.equal(readFileSync(join(fixture.workspaceRoot, "REPO.md"), "utf8"), "Local repositories\n");
		assert.equal(readFileSync(join(fixture.workspaceRoot, "USERNAME.md"), "utf8"), "Local identity\n");
		fixture.run();
		for (const link of fixture.links) {
			assert.equal(readlinkSync(link.destination), join(fixture.guidanceRoot, link.profile), "already migrated links stay intact");
		}
	} finally {
		fixture.cleanup();
	}
});

test("the documented migration preserves regular context files and unrelated symlinks", () => {
	const fixture = createFixture();
	try {
		const [globalLink, workspaceLink] = fixture.links;
		writeFileSync(globalLink!.destination, "User-owned guidance\n");
		const unrelated = join(fixture.workspaceRoot, "CUSTOM.md");
		writeFileSync(unrelated, "Custom workspace guidance\n");
		symlinkSync(unrelated, workspaceLink!.destination);
		assert.equal(fixture.run().status, 1);
		assert.equal(readFileSync(globalLink!.destination, "utf8"), "User-owned guidance\n");
		assert.equal(readlinkSync(workspaceLink!.destination), unrelated);
	} finally {
		fixture.cleanup();
	}
});

test("the documented migration preserves old links when new guidance is missing", () => {
	const fixture = createFixture();
	try {
		rmSync(fixture.guidanceRoot, { recursive: true });
		for (const link of fixture.links) {
			symlinkSync(join(fixture.packageRoot, "personas", link.profile), link.destination);
		}
		assert.equal(fixture.run().status, 1);
		for (const link of fixture.links) {
			assert.equal(readlinkSync(link.destination), join(fixture.packageRoot, "personas", link.profile));
		}
	} finally {
		fixture.cleanup();
	}
});
