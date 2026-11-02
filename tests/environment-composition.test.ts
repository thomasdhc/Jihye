import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES = join(REPO_ROOT, "examples", "profiles");
const TMP_ROOT = join(REPO_ROOT, "tmp");
const LOCAL_PACKAGE_REF = /^\.\.\/\.\.\/packages\/[a-z0-9-]+$/;
const roots: string[] = [];

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Profile = { packages: string[] };
type Resource = { type: string; path: string };

function readExample(name: string): Profile {
	return JSON.parse(readFileSync(join(PROFILES, name, "settings.example.json"), "utf8"));
}

function packageName(ref: string): string {
	return basename(ref);
}

function coreAndEnvironment(): { core: string; environment: string } {
	const [core] = readExample("public").packages;
	const environment = readExample("work").packages.find((ref) => ref !== core);
	assert.ok(core && environment);
	return { core: packageName(core), environment: packageName(environment) };
}

function writeFixturePackage(root: string, name: string): void {
	const packageRoot = join(root, "packages", name);
	mkdirSync(join(packageRoot, "skills", `${name}-skill`), { recursive: true });
	mkdirSync(join(packageRoot, "prompts"), { recursive: true });
	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name, private: true }));
	writeFileSync(
		join(packageRoot, "skills", `${name}-skill`, "SKILL.md"),
		`---\nname: ${name}-skill\ndescription: Fixture skill for ${name}.\n---\n`,
	);
	writeFileSync(join(packageRoot, "prompts", `${name}-prompt.md`), `Fixture prompt for ${name}.\n`);
}

// Builds a fictional relocatable workstation root and copies each example verbatim into its profile.
function createWorkstation(): string {
	mkdirSync(TMP_ROOT, { recursive: true });
	const root = mkdtempSync(join(TMP_ROOT, "environment-composition-"));
	roots.push(root);
	const { core, environment } = coreAndEnvironment();
	for (const name of [core, environment, "environment-b"]) writeFixturePackage(root, name);
	for (const profile of ["public", "work"]) {
		mkdirSync(join(root, "profiles", profile), { recursive: true });
		writeFileSync(
			join(root, "profiles", profile, "settings.json"),
			readFileSync(join(PROFILES, profile, "settings.example.json")),
		);
	}
	mkdirSync(join(root, "project"), { recursive: true });
	return root;
}

function loadProfile(root: string, profile: string) {
	const settingsManager = SettingsManager.create(join(root, "project"), join(root, "profiles", profile), {
		projectTrusted: false,
	});
	const packageManager = new DefaultPackageManager({
		cwd: join(root, "project"),
		agentDir: join(root, "profiles", profile),
		settingsManager,
	});
	return { settingsManager, packageManager };
}

// Isolates native home-directory discovery from the real user configuration.
async function resolveResources(root: string, packageManager: DefaultPackageManager): Promise<Resource[]> {
	const home = process.env.HOME;
	process.env.HOME = root;
	try {
		const resolved = await packageManager.resolve(async () => "error");
		const resources: Resource[] = [];
		for (const type of ["extensions", "skills", "prompts", "themes"] as const) {
			for (const resource of resolved[type]) {
				assert.ok(resource.enabled, resource.path);
				assert.equal(resource.metadata.origin, "package", resource.path);
				assert.equal(resource.metadata.scope, "user", resource.path);
				assert.ok(!relative(root, resource.path).startsWith(".."), `${resource.path} escapes ${root}`);
				resources.push({ type, path: relative(root, resource.path) });
			}
		}
		return resources.sort((a, b) => `${a.type}:${a.path}`.localeCompare(`${b.type}:${b.path}`));
	} finally {
		if (home === undefined) delete process.env.HOME;
		else process.env.HOME = home;
	}
}

function fixtureResources(name: string): Resource[] {
	return [
		{ type: "prompts", path: join("packages", name, "prompts", `${name}-prompt.md`) },
		{ type: "skills", path: join("packages", name, "skills", `${name}-skill`, "SKILL.md") },
	];
}

function sorted(resources: Resource[]): Resource[] {
	return [...resources].sort((a, b) => `${a.type}:${a.path}`.localeCompare(`${b.type}:${b.path}`));
}

test("profile examples are minimal portable package lists sharing one core entry", () => {
	const publicProfile = readExample("public");
	const workProfile = readExample("work");
	for (const profile of [publicProfile, workProfile]) {
		assert.deepEqual(Object.keys(profile), ["packages"]);
		assert.ok(Array.isArray(profile.packages) && profile.packages.length > 0);
		for (const ref of profile.packages) assert.match(ref, LOCAL_PACKAGE_REF);
		assert.equal(new Set(profile.packages).size, profile.packages.length);
	}
	assert.equal(publicProfile.packages.length, 1);
	assert.equal(packageName(publicProfile.packages[0]), "jihye");
	assert.equal(workProfile.packages.length, 2);
	assert.equal(workProfile.packages[0], publicProfile.packages[0]);
});

test("public profile natively resolves the core without an environment package at either root", async () => {
	const { core, environment } = coreAndEnvironment();
	const results = [];
	for (const root of [createWorkstation(), createWorkstation()]) {
		for (const name of [environment, "environment-b"]) {
			rmSync(join(root, "packages", name), { recursive: true, force: true });
		}
		results.push(await resolveResources(root, loadProfile(root, "public").packageManager));
	}
	assert.deepEqual(results[0], sorted(fixtureResources(core)));
	assert.deepEqual(results[1], results[0]);
});

test("work profile natively adds its environment package to the same core", async () => {
	const { core, environment } = coreAndEnvironment();
	const results = [];
	for (const root of [createWorkstation(), createWorkstation()]) {
		results.push(await resolveResources(root, loadProfile(root, "work").packageManager));
	}
	assert.deepEqual(results[0], sorted([...fixtureResources(core), ...fixtureResources(environment)]));
	assert.deepEqual(results[1], results[0]);
});

test("swapping the work environment package reloads B instead of A and keeps core", async () => {
	const { core, environment } = coreAndEnvironment();
	const root = createWorkstation();
	const { settingsManager, packageManager } = loadProfile(root, "work");
	assert.deepEqual(
		await resolveResources(root, packageManager),
		sorted([...fixtureResources(core), ...fixtureResources(environment)]),
	);

	const settingsPath = join(root, "profiles", "work", "settings.json");
	const settings: Profile = JSON.parse(readFileSync(settingsPath, "utf8"));
	settings.packages = settings.packages.map((ref) =>
		packageName(ref) === environment ? "../../packages/environment-b" : ref,
	);
	writeFileSync(settingsPath, JSON.stringify(settings));
	await settingsManager.reload();

	assert.deepEqual(
		await resolveResources(root, packageManager),
		sorted([...fixtureResources(core), ...fixtureResources("environment-b")]),
	);
});
