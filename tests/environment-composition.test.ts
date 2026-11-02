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
	global: "<jihye-package-source>",
	workspace: "<environment-package-source>",
};
const roots: string[] = [];

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Example = keyof typeof MARKERS;
type PackageSettings = { packages: string[] };
type Resource = { type: string; path: string; scope: "user" | "project" };
type Fixture = { root: string; home: string; agentDir: string; selected: string; unselected: string };

function readExample(name: Example): PackageSettings {
	return JSON.parse(readFileSync(join(EXAMPLES, `${name}.settings.example.json`), "utf8"));
}

// These markers are authoring instructions, not sources Pi can execute or interpolate.
function writeExample(name: Example, settingsPath: string, packageRoot: string): void {
	const example = readExample(name);
	assert.deepEqual(example, { packages: [MARKERS[name]] });
	const settings = {
		packages: example.packages.map(() => relative(dirname(settingsPath), packageRoot)),
	};
	mkdirSync(dirname(settingsPath), { recursive: true });
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

function createFixture(withEnvironment: boolean): Fixture {
	mkdirSync(TMP_ROOT, { recursive: true });
	const root = mkdtempSync(join(TMP_ROOT, "environment-composition-"));
	roots.push(root);
	const home = join(root, "home");
	const agentDir = join(home, ".pi", "agent");
	const selected = join(root, "workspaces", "selected");
	const unselected = join(root, "workspaces", "unselected");
	writeFixturePackage(root, "jihye");
	if (withEnvironment) {
		for (const name of ["environment-a", "environment-b"]) writeFixturePackage(root, name);
	}
	writeExample("global", join(agentDir, "settings.json"), join(root, "checkouts", "jihye"));
	writeExample("workspace", join(selected, ".pi", "settings.json"), join(root, "checkouts", "environment-a"));
	mkdirSync(unselected, { recursive: true });
	return { root, home, agentDir, selected, unselected };
}

// Use one global agent directory for both workspace cwd values; never consult real HOME configuration.
async function withFixture(run: (fixture: Fixture) => Promise<void>, withEnvironment = true): Promise<void> {
	const fixture = createFixture(withEnvironment);
	const home = process.env.HOME;
	process.env.HOME = fixture.home;
	try {
		await run(fixture);
	} finally {
		if (home === undefined) delete process.env.HOME;
		else process.env.HOME = home;
	}
}

function loadWorkspace(fixture: Fixture, cwd: string, projectTrusted = true) {
	const settingsManager = SettingsManager.create(cwd, fixture.agentDir, { projectTrusted });
	assert.equal(settingsManager.isProjectTrusted(), projectTrusted);
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
			assert.ok(scope === "user" || scope === "project", resource.path);
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

function fixtureResources(name: string, scope: Resource["scope"]): Resource[] {
	return [
		{ type: "prompts", path: join("checkouts", name, "prompts", `${name}-prompt.md`), scope },
		{ type: "skills", path: join("checkouts", name, "skills", `${name}-skill`, "SKILL.md"), scope },
	];
}

function sorted(resources: Resource[]): Resource[] {
	return [...resources].sort((a, b) => `${a.type}:${a.path}`.localeCompare(`${b.type}:${b.path}`));
}

test("composition examples declare only explicit replace-before-use package sources", () => {
	for (const name of ["global", "workspace"] as const) {
		assert.deepEqual(readExample(name), { packages: [MARKERS[name]] });
	}
});

test("trusted workspace adds project environment to one shared user core at either root", async () => {
	const results: Resource[][] = [];
	for (let i = 0; i < 2; i++) {
		await withFixture(async (fixture) => {
			const selected = loadWorkspace(fixture, fixture.selected);
			const unselected = loadWorkspace(fixture, fixture.unselected);
			assert.deepEqual(selected.settingsManager.getGlobalSettings(), unselected.settingsManager.getGlobalSettings());
			const resources = await resolveResources(fixture, selected.packageManager);
			assert.deepEqual(resources, sorted([
				...fixtureResources("jihye", "user"),
				...fixtureResources("environment-a", "project"),
			]));
			assert.deepEqual(
				await resolveResources(fixture, unselected.packageManager),
				sorted(fixtureResources("jihye", "user")),
			);
			results.push(resources);
		});
	}
	assert.deepEqual(results[1], results[0]);
});

test("unselected workspace resolves only global core with environment checkouts absent at either root", async () => {
	const results: Resource[][] = [];
	for (let i = 0; i < 2; i++) {
		await withFixture(async (fixture) => {
			for (const name of ["environment-a", "environment-b"]) {
				assert.equal(existsSync(join(fixture.root, "checkouts", name)), false);
			}
			assert.equal(existsSync(join(fixture.unselected, ".pi", "settings.json")), false);
			const { settingsManager, packageManager } = loadWorkspace(fixture, fixture.unselected);
			assert.deepEqual(settingsManager.getProjectSettings(), {});
			const resources = await resolveResources(fixture, packageManager);
			assert.deepEqual(resources, sorted(fixtureResources("jihye", "user")));
			results.push(resources);
		}, false);
	}
	assert.deepEqual(results[1], results[0]);
});

test("workspace environment replacement and removal reload without changing global core", async () => {
	await withFixture(async (fixture) => {
		const { settingsManager, packageManager } = loadWorkspace(fixture, fixture.selected);
		const globalSettingsPath = join(fixture.agentDir, "settings.json");
		const globalSettings = readFileSync(globalSettingsPath, "utf8");
		assert.deepEqual(
			await resolveResources(fixture, packageManager),
			sorted([...fixtureResources("jihye", "user"), ...fixtureResources("environment-a", "project")]),
		);

		const settingsPath = join(fixture.selected, ".pi", "settings.json");
		writeExample("workspace", settingsPath, join(fixture.root, "checkouts", "environment-b"));
		await settingsManager.reload();
		assert.deepEqual(settingsManager.drainErrors(), []);
		assert.deepEqual(
			await resolveResources(fixture, packageManager),
			sorted([...fixtureResources("jihye", "user"), ...fixtureResources("environment-b", "project")]),
		);

		writeFileSync(settingsPath, JSON.stringify({ packages: [] }));
		await settingsManager.reload();
		assert.deepEqual(settingsManager.drainErrors(), []);
		assert.deepEqual(await resolveResources(fixture, packageManager), sorted(fixtureResources("jihye", "user")));
		assert.equal(readFileSync(globalSettingsPath, "utf8"), globalSettings);
	});
});

test("untrusted workspace ignores its environment declaration and keeps global core after reload", async () => {
	await withFixture(async (fixture) => {
		assert.ok(existsSync(join(fixture.root, "checkouts", "environment-a")));
		const { settingsManager, packageManager } = loadWorkspace(fixture, fixture.selected, false);
		assert.deepEqual(settingsManager.getProjectSettings(), {});
		assert.deepEqual(await resolveResources(fixture, packageManager), sorted(fixtureResources("jihye", "user")));
		await settingsManager.reload();
		assert.deepEqual(settingsManager.drainErrors(), []);
		assert.deepEqual(settingsManager.getProjectSettings(), {});
		assert.deepEqual(await resolveResources(fixture, packageManager), sorted(fixtureResources("jihye", "user")));
	});
});
