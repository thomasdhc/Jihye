import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(REPO_ROOT, "examples", "composition");
const TMP_ROOT = join(REPO_ROOT, "tmp");
const MARKERS = {
	core: "<jihye-package-source>",
	environment: "<environment-package-source>",
};
const roots: string[] = [];

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type PackageSettings = { packages: string[] };
type Resource = { type: string; path: string; scope: "user" };
type Environment = "environment-a" | "environment-b";
type Fixture = { root: string; home: string; agentDir: string; workspace: string; otherCwd: string };

function readExample(): PackageSettings {
	return JSON.parse(readFileSync(join(EXAMPLES, "settings.example.json"), "utf8"));
}

// Test-only replacement: these authoring markers are not executable sources or runtime interpolation.
function writeExample(fixture: Fixture, environment?: Environment): void {
	const example = readExample();
	assert.deepEqual(example, { packages: [MARKERS.core, MARKERS.environment] });
	const sources: Record<string, string> = {
		[MARKERS.core]: join(fixture.root, "checkouts", "jihye"),
	};
	if (environment) sources[MARKERS.environment] = join(fixture.root, "checkouts", environment);
	const settingsPath = join(fixture.agentDir, "settings.json");
	const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
	settings.packages = example.packages
		.filter((marker) => marker in sources)
		.map((marker) => relative(fixture.agentDir, sources[marker]));
	mkdirSync(fixture.agentDir, { recursive: true });
	writeFileSync(settingsPath, JSON.stringify(settings));
}

function writeFixturePackage(root: string, name: string): void {
	const packageRoot = join(root, "checkouts", name);
	mkdirSync(join(packageRoot, "skills", `${name}-skill`), { recursive: true });
	mkdirSync(join(packageRoot, "prompts"), { recursive: true });
	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name, private: true }));
	writeFileSync(
		join(packageRoot, "skills", `${name}-skill`, "SKILL.md"),
		`---\nname: ${name}-skill\ndescription: Fixture skill for ${name}.\n---\n`,
	);
	writeFileSync(join(packageRoot, "prompts", `${name}-prompt.md`), `Fixture prompt for ${name}.\n`);
}

function createFixture(environment?: Environment): Fixture {
	mkdirSync(TMP_ROOT, { recursive: true });
	const root = mkdtempSync(join(TMP_ROOT, "environment-composition-"));
	roots.push(root);
	const home = join(root, "home");
	const agentDir = join(home, ".pi", "agent");
	const workspace = join(root, "workspace");
	const otherCwd = join(workspace, "project");
	const fixture = { root, home, agentDir, workspace, otherCwd };
	writeFixturePackage(root, "jihye");
	if (environment) {
		for (const name of ["environment-a", "environment-b"]) writeFixturePackage(root, name);
	}
	writeExample(fixture, environment);
	mkdirSync(otherCwd, { recursive: true });
	return fixture;
}

// Synthetic machines run sequentially with isolated HOME and explicit agent directories.
async function withMachine(fixture: Fixture, run: () => Promise<void>): Promise<void> {
	const home = process.env.HOME;
	process.env.HOME = fixture.home;
	try {
		await run();
	} finally {
		if (home === undefined) delete process.env.HOME;
		else process.env.HOME = home;
	}
}

function loadMachine(fixture: Fixture, cwd = fixture.workspace, projectTrusted = true) {
	assert.equal(existsSync(join(cwd, ".pi", "settings.json")), false);
	const settingsManager = SettingsManager.create(cwd, fixture.agentDir, { projectTrusted });
	assert.equal(settingsManager.isProjectTrusted(), projectTrusted);
	assert.deepEqual(settingsManager.getProjectSettings(), {});
	assert.deepEqual(settingsManager.drainErrors(), []);
	const packageManager = new DefaultPackageManager({ cwd, agentDir: fixture.agentDir, settingsManager });
	return { settingsManager, packageManager };
}

function assertInside(root: string, path: string): void {
	const pathFromRoot = relative(realpathSync(root), realpathSync(path));
	assert.ok(
		pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot),
		`${path} escapes ${root}`,
	);
}

async function resolveResources(fixture: Fixture, packageManager: DefaultPackageManager): Promise<Resource[]> {
	const resolved = await packageManager.resolve(async () => "error");
	const packages = packageManager.listConfiguredPackages();
	const resources: Resource[] = [];
	for (const type of ["extensions", "skills", "prompts", "themes"] as const) {
		for (const resource of resolved[type]) {
			assert.ok(resource.enabled, resource.path);
			assert.equal(resource.metadata.origin, "package", resource.path);
			const scope = resource.metadata.scope;
			assert.equal(scope, "user", resource.path);
			const declaration = packages.find((pkg) => pkg.source === resource.metadata.source && pkg.scope === scope);
			assert.ok(declaration?.installedPath, resource.path);
			assert.equal(resource.metadata.baseDir, declaration.installedPath, resource.path);
			assertInside(fixture.root, declaration.installedPath);
			assertInside(declaration.installedPath, resource.path);
			assertInside(fixture.root, resource.path);
			resources.push({ type, path: relative(fixture.root, resource.path), scope });
		}
	}
	return sorted(resources);
}

function fixtureResources(name: string): Resource[] {
	return [
		{ type: "prompts", path: join("checkouts", name, "prompts", `${name}-prompt.md`), scope: "user" },
		{ type: "skills", path: join("checkouts", name, "skills", `${name}-skill`, "SKILL.md"), scope: "user" },
	];
}

function sorted(resources: Resource[]): Resource[] {
	return [...resources].sort((a, b) => `${a.type}:${a.path}`.localeCompare(`${b.type}:${b.path}`));
}

test("composition example declares only explicit replace-before-use package sources", () => {
	assert.deepEqual(readExample(), { packages: [MARKERS.core, MARKERS.environment] });
});

test("core-only machine resolves global core with no environment checkout present", async () => {
	const fixture = createFixture();
	await withMachine(fixture, async () => {
		for (const name of ["environment-a", "environment-b"]) {
			assert.equal(existsSync(join(fixture.root, "checkouts", name)), false);
		}
		const { packageManager } = loadMachine(fixture);
		assert.deepEqual(await resolveResources(fixture, packageManager), sorted(fixtureResources("jihye")));
	});
});

test("attached machine loads global core once plus environment regardless of cwd or project trust", async () => {
	const fixture = createFixture("environment-a");
	const globalSettings = JSON.parse(readFileSync(join(fixture.agentDir, "settings.json"), "utf8"));
	await withMachine(fixture, async () => {
		for (const cwd of [fixture.workspace, fixture.otherCwd]) {
			for (const projectTrusted of [true, false]) {
				const { settingsManager, packageManager } = loadMachine(fixture, cwd, projectTrusted);
				assert.deepEqual(settingsManager.getGlobalSettings(), globalSettings);
				assert.deepEqual(
					packageManager.listConfiguredPackages().map(({ source, scope }) => ({ source, scope })),
					globalSettings.packages.map((source: string) => ({ source, scope: "user" })),
				);
				assert.deepEqual(
					await resolveResources(fixture, packageManager),
					sorted([...fixtureResources("jihye"), ...fixtureResources("environment-a")]),
				);
			}
		}
	});
});

test("independent machine roots choose different global packages without interference", async () => {
	const coreOnly = createFixture();
	const attached = createFixture("environment-a");
	assert.notEqual(coreOnly.root, attached.root);
	const coreSettings = readFileSync(join(coreOnly.agentDir, "settings.json"), "utf8");
	const attachedSettings = readFileSync(join(attached.agentDir, "settings.json"), "utf8");
	for (const fixture of [coreOnly, attached, coreOnly]) {
		await withMachine(fixture, async () => {
			const { packageManager } = loadMachine(fixture);
			const expected = fixture === coreOnly
				? fixtureResources("jihye")
				: [...fixtureResources("jihye"), ...fixtureResources("environment-a")];
			assert.deepEqual(await resolveResources(fixture, packageManager), sorted(expected));
		});
	}
	assert.equal(readFileSync(join(coreOnly.agentDir, "settings.json"), "utf8"), coreSettings);
	assert.equal(readFileSync(join(attached.agentDir, "settings.json"), "utf8"), attachedSettings);
});

test("global environment replacement and removal reload only one machine's package choice", async () => {
	const fixture = createFixture("environment-a");
	const otherMachine = createFixture("environment-b");
	const settingsPath = join(fixture.agentDir, "settings.json");
	const initialSettings = { ...JSON.parse(readFileSync(settingsPath, "utf8")), quietStartup: true };
	writeFileSync(settingsPath, JSON.stringify(initialSettings));
	const otherSettingsPath = join(otherMachine.agentDir, "settings.json");
	const otherSettings = readFileSync(otherSettingsPath, "utf8");
	await withMachine(fixture, async () => {
		const { settingsManager, packageManager } = loadMachine(fixture, fixture.workspace, false);
		assert.deepEqual(
			await resolveResources(fixture, packageManager),
			sorted([...fixtureResources("jihye"), ...fixtureResources("environment-a")]),
		);

		for (const environment of ["environment-b", undefined] as const) {
			writeExample(fixture, environment);
			await settingsManager.reload();
			assert.deepEqual(settingsManager.drainErrors(), []);
			assert.deepEqual(settingsManager.getProjectSettings(), {});
			const packages = [initialSettings.packages[0]];
			if (environment) packages.push(relative(fixture.agentDir, join(fixture.root, "checkouts", environment)));
			const expectedSettings = { ...initialSettings, packages };
			assert.deepEqual(settingsManager.getGlobalSettings(), expectedSettings);
			assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), expectedSettings);
			assert.deepEqual(
				await resolveResources(fixture, packageManager),
				sorted([...fixtureResources("jihye"), ...(environment ? fixtureResources(environment) : [])]),
			);
			await withMachine(otherMachine, async () => {
				const other = loadMachine(otherMachine);
				await other.settingsManager.reload();
				assert.deepEqual(other.settingsManager.drainErrors(), []);
				assert.deepEqual(other.settingsManager.getGlobalSettings(), JSON.parse(otherSettings));
				assert.deepEqual(
					await resolveResources(otherMachine, other.packageManager),
					sorted([...fixtureResources("jihye"), ...fixtureResources("environment-b")]),
				);
			});
			assert.equal(readFileSync(otherSettingsPath, "utf8"), otherSettings);
		}
	});
});
