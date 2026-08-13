import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import jihyeSetupExtension from "../extensions/jihye-setup/index.ts";
import {
	createDefaultJihyeSetupConfig,
	getJihyeSetupConfigPath,
	loadJihyeSetupConfig,
	parseJihyeSetupConfig,
} from "../extensions/jihye-setup/config.ts";
import {
	findLegacyExtensionCopies,
	findWorkspaceDirectory,
	formatFactBlock,
	isWithin,
	resolveJihyeSetupFacts,
	resolvePackagePaths,
	resolveProfile,
} from "../extensions/jihye-setup/paths.ts";
import {
	JIHYE_RUNTIME_ENTRY_TYPE,
	createJihyeRuntimeMetadata,
	ensureJihyeRuntimeMarker,
	latestJihyeRuntimeMetadata,
	loadJihyePackageVersion,
	type JihyeRuntimeMetadata,
} from "../extensions/jihye-setup/provenance.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_DIR = join(REPO_ROOT, "extensions", "jihye-setup");

/**
 * Build a fixture that mirrors a real installation: a package checkout with
 * personas, an agent directory, and a workspace root linked to the personas.
 */
function createFixture(options: { profile?: "strict" | "standard" | "unmanaged"; localEnvironment?: boolean } = {}) {
	const root = mkdtempSync(join(tmpdir(), "jihye-setup-"));
	const packageRoot = join(root, "package");
	const personasDirectory = join(packageRoot, "personas");
	const extensionDirectory = join(packageRoot, "extensions", "jihye-setup");
	const agentDirectory = join(root, "agent");
	const workspaceDirectory = join(root, "workspace");
	const repositoryDirectory = join(workspaceDirectory, "project", "src");

	mkdirSync(personasDirectory, { recursive: true });
	mkdirSync(extensionDirectory, { recursive: true });
	mkdirSync(agentDirectory, { recursive: true });
	mkdirSync(repositoryDirectory, { recursive: true });

	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "jihye-fixture", version: "9.8.7" }));
	writeFileSync(join(personasDirectory, "JIHYE.md"), "# Jihye\n");
	writeFileSync(join(personasDirectory, "JIHYE_strict.md"), "# Jihye strict\n");
	writeFileSync(join(personasDirectory, "WORKSPACE.md"), "# Workspace\n");
	symlinkSync(join(personasDirectory, "WORKSPACE.md"), join(workspaceDirectory, "AGENTS.md"));

	const profile = options.profile ?? "strict";
	if (profile === "unmanaged") writeFileSync(join(agentDirectory, "AGENTS.md"), "# Local rules\n");
	else {
		const persona = profile === "strict" ? "JIHYE_strict.md" : "JIHYE.md";
		symlinkSync(join(personasDirectory, persona), join(agentDirectory, "AGENTS.md"));
	}

	if (options.localEnvironment !== false) {
		writeFileSync(join(workspaceDirectory, "REPO.md"), "# Repos\n");
		writeFileSync(join(workspaceDirectory, "USERNAME.md"), "# User\n");
	}

	return {
		root,
		packageRoot,
		personasDirectory,
		extensionDirectory,
		agentDirectory,
		workspaceDirectory,
		repositoryDirectory,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("derives package and personas paths from the extension location", () => {
	const paths = resolvePackagePaths(EXTENSION_DIR);

	assert.equal(paths.packageRoot, REPO_ROOT);
	assert.equal(paths.personasDirectory, join(REPO_ROOT, "personas"));
	assert.equal(loadJihyePackageVersion(REPO_ROOT), "0.2.1");
});

test("records one durable runtime marker per version, profile, and Pi runtime", () => {
	const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
	const appended: JihyeRuntimeMetadata[] = [];
	const append = (customType: string, data: JihyeRuntimeMetadata) => {
		entries.push({ type: "custom", customType, data });
		appended.push(data);
	};
	const first = createJihyeRuntimeMetadata("0.2.1", "standard", "0.83.0");

	assert.equal(ensureJihyeRuntimeMarker(entries, first, append), true);
	assert.equal(ensureJihyeRuntimeMarker(entries, first, append), false, "an unchanged runtime does not duplicate its marker");
	assert.equal(ensureJihyeRuntimeMarker(
		entries,
		createJihyeRuntimeMetadata("0.2.2", "standard", "0.83.0"),
		append,
	), true);
	assert.equal(ensureJihyeRuntimeMarker(
		entries,
		createJihyeRuntimeMetadata("0.2.2", "strict", "0.83.0"),
		append,
	), true);
	assert.equal(ensureJihyeRuntimeMarker(
		entries,
		createJihyeRuntimeMetadata("0.2.2", "strict", "0.84.0"),
		append,
	), true);
	assert.equal(appended.length, 4);
	assert.equal(entries[0]?.customType, JIHYE_RUNTIME_ENTRY_TYPE);
	assert.deepEqual(latestJihyeRuntimeMetadata(entries), createJihyeRuntimeMetadata("0.2.2", "strict", "0.84.0"));

	const future = { ...createJihyeRuntimeMetadata("0.3.0", "standard", "0.84.0"), schemaVersion: 2 };
	entries.push({ type: "custom", customType: JIHYE_RUNTIME_ENTRY_TYPE, data: future });
	assert.deepEqual(latestJihyeRuntimeMetadata(entries), future, "additive future marker schemas remain attributable");
});

test("session start records runtime provenance without UI and avoids duplicate markers", async () => {
	type SessionStartHandler = (event: unknown, ctx: any) => Promise<void>;
	let sessionStart: SessionStartHandler | undefined;
	let sessionTree: SessionStartHandler | undefined;
	const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
	jihyeSetupExtension({
		registerEntryRenderer() {},
		registerCommand() {},
		on(name: string, handler: SessionStartHandler) {
			if (name === "session_start") sessionStart = handler;
			if (name === "session_tree") sessionTree = handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
	} as never);
	const ctx = {
		cwd: REPO_ROOT,
		hasUI: false,
		sessionManager: { getBranch: () => entries },
	};

	await sessionStart?.({ reason: "startup" }, ctx);
	await sessionStart?.({ reason: "reload" }, ctx);

	assert.equal(entries.length, 1);
	assert.equal(entries[0]?.customType, JIHYE_RUNTIME_ENTRY_TYPE);
	assert.equal(latestJihyeRuntimeMetadata(entries)?.jihyeVersion, "0.2.1");

	entries.splice(0, entries.length, {
		type: "custom",
		customType: JIHYE_RUNTIME_ENTRY_TYPE,
		data: createJihyeRuntimeMetadata("0.2.0", "standard", "0.83.0"),
	});
	await sessionTree?.({ newLeafId: "old-branch" }, ctx);
	assert.equal(entries.length, 2, "tree navigation behind a transition reasserts the current runtime");
	assert.equal(latestJihyeRuntimeMetadata(entries)?.jihyeVersion, "0.2.1");
});

test("treats a directory as within itself but not within a sibling", () => {
	assert.equal(isWithin("/a/b", "/a/b"), true);
	assert.equal(isWithin("/a/b", "/a/b/c"), true);
	assert.equal(isWithin("/a/b", "/a/bc"), false);
	assert.equal(isWithin("/a/b", "/a"), false);
});

test("discovers the workspace root above the working directory", () => {
	const fixture = createFixture();
	try {
		assert.equal(
			findWorkspaceDirectory({ cwd: fixture.repositoryDirectory, personasDirectory: fixture.personasDirectory }),
			fixture.workspaceDirectory,
		);
	} finally {
		fixture.cleanup();
	}
});

test("discovers a workspace root from its local environment files alone", () => {
	const fixture = createFixture();
	try {
		rmSync(join(fixture.workspaceDirectory, "AGENTS.md"));
		assert.equal(
			findWorkspaceDirectory({ cwd: fixture.repositoryDirectory, personasDirectory: fixture.personasDirectory }),
			fixture.workspaceDirectory,
		);
	} finally {
		fixture.cleanup();
	}
});

test("leaves the workspace root unresolved outside any managed directory", () => {
	const fixture = createFixture();
	try {
		assert.equal(
			findWorkspaceDirectory({ cwd: fixture.packageRoot, personasDirectory: fixture.personasDirectory }),
			undefined,
		);
	} finally {
		fixture.cleanup();
	}
});

test("prefers configured workspace roots over discovery", () => {
	const fixture = createFixture();
	const configured = join(fixture.root, "configured");
	try {
		assert.equal(
			findWorkspaceDirectory({
				cwd: fixture.repositoryDirectory,
				personasDirectory: fixture.personasDirectory,
				workspaceRoots: [configured, fixture.workspaceDirectory],
			}),
			fixture.workspaceDirectory,
		);
		assert.equal(
			findWorkspaceDirectory({
				cwd: fixture.packageRoot,
				personasDirectory: fixture.personasDirectory,
				workspaceRoots: [configured],
			}),
			configured,
			"a single configured root applies even when work happens outside it",
		);
		assert.equal(
			findWorkspaceDirectory({
				cwd: fixture.packageRoot,
				personasDirectory: fixture.personasDirectory,
				workspaceRoots: [configured, fixture.workspaceDirectory],
			}),
			undefined,
			"several configured roots stay ambiguous outside all of them",
		);
	} finally {
		fixture.cleanup();
	}
});

test("classifies the installed global persona", () => {
	for (const [profile, expected] of [["strict", "strict"], ["standard", "standard"], ["unmanaged", "unmanaged"]] as const) {
		const fixture = createFixture({ profile });
		try {
			assert.equal(resolveProfile(fixture.agentDirectory, fixture.personasDirectory), expected);
		} finally {
			fixture.cleanup();
		}
	}

	const fixture = createFixture();
	try {
		rmSync(join(fixture.agentDirectory, "AGENTS.md"));
		assert.equal(resolveProfile(fixture.agentDirectory, fixture.personasDirectory), "missing");
	} finally {
		fixture.cleanup();
	}
});

test("resolves the full fact set with guidance load state", () => {
	const fixture = createFixture();
	try {
		const facts = resolveJihyeSetupFacts({
			extensionDirectory: fixture.extensionDirectory,
			agentDirectory: fixture.agentDirectory,
			cwd: fixture.repositoryDirectory,
			loadedContextFiles: [join(fixture.workspaceDirectory, "AGENTS.md")],
		});

		assert.equal(facts.packageRoot, fixture.packageRoot);
		assert.equal(facts.personasDirectory, fixture.personasDirectory);
		assert.equal(facts.workspaceDirectory, fixture.workspaceDirectory);
		assert.equal(facts.profile, "strict");
		assert.deepEqual(facts.localEnvironmentFiles, [
			join(fixture.workspaceDirectory, "REPO.md"),
			join(fixture.workspaceDirectory, "USERNAME.md"),
		]);
		assert.deepEqual(facts.missingLocalEnvironmentFiles, []);

		const [globalLink, workspaceLink] = facts.guidance;
		assert.equal(globalLink?.path, join(fixture.agentDirectory, "AGENTS.md"));
		assert.equal(globalLink?.target, join(fixture.personasDirectory, "JIHYE_strict.md"));
		assert.equal(globalLink?.managed, true);
		assert.equal(globalLink?.loaded, false);
		assert.equal(workspaceLink?.target, join(fixture.personasDirectory, "WORKSPACE.md"));
		assert.equal(workspaceLink?.loaded, true, "a loaded symlink counts as loaded guidance");
	} finally {
		fixture.cleanup();
	}
});

test("reports missing local environment files and unmanaged guidance", () => {
	const fixture = createFixture({ profile: "unmanaged", localEnvironment: false });
	try {
		const facts = resolveJihyeSetupFacts({
			extensionDirectory: fixture.extensionDirectory,
			agentDirectory: fixture.agentDirectory,
			cwd: fixture.repositoryDirectory,
		});

		assert.equal(facts.profile, "unmanaged");
		assert.deepEqual(facts.localEnvironmentFiles, []);
		assert.deepEqual(facts.missingLocalEnvironmentFiles, [
			join(fixture.workspaceDirectory, "REPO.md"),
			join(fixture.workspaceDirectory, "USERNAME.md"),
		]);
		assert.equal(facts.guidance[0]?.managed, false);
	} finally {
		fixture.cleanup();
	}
});

test("formats facts as declarative system prompt lines", () => {
	const fixture = createFixture();
	try {
		const block = formatFactBlock(resolveJihyeSetupFacts({
			extensionDirectory: fixture.extensionDirectory,
			agentDirectory: fixture.agentDirectory,
			cwd: fixture.repositoryDirectory,
			loadedContextFiles: [join(fixture.workspaceDirectory, "AGENTS.md")],
		}));

		assert.match(block, /^## Jihye Setup \(resolved paths — use directly, do not re-derive\)$/m);
		assert.match(block, new RegExp(`^- jihye_package: ${fixture.packageRoot}$`, "m"));
		assert.match(block, new RegExp(`^- workspace_directory: ${fixture.workspaceDirectory}$`, "m"));
		assert.match(block, /^- workspace_profile: strict$/m);
		assert.match(block, /\[loaded\]/);
		assert.match(block, /\[not loaded\]/);
		assert.doesNotMatch(block, /readlink|dirname/);
		assert.doesNotMatch(block, /jihye[_ ]version/i, "runtime version stays out of the system prompt");
	} finally {
		fixture.cleanup();
	}
});

test("classifies a persona reached through a symlinked package ancestor", () => {
	// A real install can sit behind a symlinked ancestor: macOS resolves tmpdir()
	// through /private/var, and linked homes or checkouts do the same elsewhere.
	// The link below reproduces that on every platform.
	const fixture = createFixture();
	try {
		const aliasRoot = join(fixture.root, "alias");
		symlinkSync(fixture.packageRoot, aliasRoot);
		const aliasPersonas = join(aliasRoot, "personas");

		assert.equal(
			resolveProfile(fixture.agentDirectory, aliasPersonas),
			"strict",
			"a symlinked personas path still resolves the managed persona",
		);

		const facts = resolveJihyeSetupFacts({
			extensionDirectory: join(aliasRoot, "extensions", "jihye-setup"),
			agentDirectory: fixture.agentDirectory,
			cwd: fixture.repositoryDirectory,
			loadedContextFiles: [],
		});

		assert.equal(facts.profile, "strict");
		assert.equal(facts.guidance[0]?.managed, true);
		assert.equal(
			facts.guidance[0]?.target,
			join(aliasPersonas, "JIHYE_strict.md"),
			"the target is reported under the personas path the caller supplied",
		);
	} finally {
		fixture.cleanup();
	}
});

test("notes an unresolved workspace root instead of guessing one", () => {
	const fixture = createFixture();
	try {
		const block = formatFactBlock(resolveJihyeSetupFacts({
			extensionDirectory: fixture.extensionDirectory,
			agentDirectory: fixture.agentDirectory,
			cwd: fixture.packageRoot,
		}));

		assert.match(block, /^- workspace_directory: unresolved/m);
	} finally {
		fixture.cleanup();
	}
});

test("finds manual extension copies that shadow bundled extensions", () => {
	const fixture = createFixture();
	try {
		mkdirSync(join(fixture.agentDirectory, "extensions", "jihye-setup"), { recursive: true });
		mkdirSync(join(fixture.agentDirectory, "extensions", "unrelated"), { recursive: true });

		assert.deepEqual(findLegacyExtensionCopies(fixture.agentDirectory, fixture.packageRoot), ["jihye-setup"]);
		assert.deepEqual(findLegacyExtensionCopies(fixture.workspaceDirectory, fixture.packageRoot), []);
	} finally {
		fixture.cleanup();
	}
});

test("defaults to showing the card and discovering workspace roots", () => {
	const config = createDefaultJihyeSetupConfig();

	assert.deepEqual(config, { card: true });
	assert.equal(getJihyeSetupConfigPath("/tmp/agent"), "/tmp/agent/jihye-setup.json");
});

test("loads configuration and treats a missing file as defaults", () => {
	const directory = mkdtempSync(join(tmpdir(), "jihye-setup-config-"));
	const configPath = join(directory, "jihye-setup.json");
	try {
		assert.deepEqual(loadJihyeSetupConfig(configPath), { card: true });

		writeFileSync(configPath, JSON.stringify({ card: false, workspaceRoots: ["/srv/workspace"] }));
		assert.deepEqual(loadJihyeSetupConfig(configPath), { card: false, workspaceRoots: ["/srv/workspace"] });

		writeFileSync(configPath, "{ not json");
		assert.throws(() => loadJihyeSetupConfig(configPath), /Invalid jihye-setup config/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("rejects malformed configuration", () => {
	assert.throws(() => parseJihyeSetupConfig([], "fixture"), /expected a JSON object/);
	assert.throws(() => parseJihyeSetupConfig({ cards: true }, "fixture"), /unknown key: cards/);
	assert.throws(() => parseJihyeSetupConfig({ card: "yes" }, "fixture"), /card must be a boolean/);
	assert.throws(() => parseJihyeSetupConfig({ workspaceRoots: [] }, "fixture"), /must be a non-empty array/);
	assert.throws(() => parseJihyeSetupConfig({ workspaceRoots: [""] }, "fixture"), /non-empty strings/);
	assert.throws(() => parseJihyeSetupConfig({ workspaceRoots: ["relative/path"] }, "fixture"), /must be an absolute path/);
});
