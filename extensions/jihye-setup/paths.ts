/**
 * Jihye setup path resolution.
 *
 * Pi loads Jihye guidance through symlinked context files, so an agent cannot
 * see where that guidance really lives. Resolving those locations is
 * deterministic path arithmetic, so it belongs here rather than in prose an
 * agent has to execute.
 *
 * Every function is pure with respect to its inputs: callers pass the
 * directories to inspect, which keeps resolution testable against fixtures.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const STRICT_PROFILE_FILE = "JIHYE_strict.md";
export const STANDARD_PROFILE_FILE = "JIHYE.md";
export const WORKSPACE_PROFILE_FILE = "WORKSPACE.md";
export const CONTEXT_FILE_NAME = "AGENTS.md";
export const LOCAL_ENVIRONMENT_FILES = ["REPO.md", "USERNAME.md"] as const;

/**
 * Which global persona backs `~/.pi/agent/AGENTS.md`.
 *
 * - `strict` / `standard`: a Jihye persona is installed.
 * - `unmanaged`: a context file exists but does not come from this package.
 * - `missing`: no global context file at all.
 */
export type WorkspaceProfile = "strict" | "standard" | "unmanaged" | "missing";

/** One context file location Jihye guidance can occupy. */
export interface GuidanceLink {
	/** Where Pi looks for the context file. */
	path: string;
	/** Resolved persona file, when the location is a link into this package. */
	target?: string;
	/** True when the location resolves into this package's `personas/`. */
	managed: boolean;
	/** True when Pi already loaded this file into the system prompt. */
	loaded: boolean;
}

export interface JihyeSetupFacts {
	packageRoot: string;
	personasDirectory: string;
	agentDirectory: string;
	/** Nearest managed workspace root, when one was resolved. */
	workspaceDirectory?: string;
	profile: WorkspaceProfile;
	/** Absolute paths of the workspace-local environment files that exist. */
	localEnvironmentFiles: string[];
	/** Absolute paths of the workspace-local environment files that are absent. */
	missingLocalEnvironmentFiles: string[];
	guidance: GuidanceLink[];
}

export interface ResolveFactsInput {
	/** Directory of this extension, normally `dirname(fileURLToPath(import.meta.url))`. */
	extensionDirectory: string;
	/** Pi's agent directory, normally `getAgentDir()`. */
	agentDirectory: string;
	cwd: string;
	/** Configured workspace roots, used instead of discovery when present. */
	workspaceRoots?: string[];
	/** Context file paths Pi already loaded for this turn. */
	loadedContextFiles?: string[];
}

function realpathOrUndefined(target: string): string | undefined {
	try {
		return fs.realpathSync(target);
	} catch {
		return undefined;
	}
}

function isFile(target: string): boolean {
	try {
		return fs.statSync(target).isFile();
	} catch {
		return false;
	}
}

/** True when `candidate` is `parent` itself or nested inside it. */
export function isWithin(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** `personas/` of the checkout or installed package this extension came from. */
export function resolvePackagePaths(extensionDirectory: string): { packageRoot: string; personasDirectory: string } {
	const packageRoot = path.dirname(path.dirname(extensionDirectory));
	return { packageRoot, personasDirectory: path.join(packageRoot, "personas") };
}

/** Ancestor chain of `from`, nearest first, including `from` itself. */
function ancestors(from: string): string[] {
	const chain: string[] = [];
	let current = path.resolve(from);
	while (true) {
		chain.push(current);
		const parent = path.dirname(current);
		if (parent === current) return chain;
		current = parent;
	}
}

/**
 * A directory is a managed workspace root when its context file links into this
 * package's personas, or when it holds the local environment files.
 */
function isWorkspaceRoot(directory: string, personasDirectory: string): boolean {
	const contextFile = path.join(directory, CONTEXT_FILE_NAME);
	const resolved = realpathOrUndefined(contextFile);
	if (resolved && isWithin(personasDirectory, resolved)) return true;
	return LOCAL_ENVIRONMENT_FILES.every((file) => isFile(path.join(directory, file)));
}

/**
 * Resolve the workspace root for `cwd`.
 *
 * Configured roots win over discovery: the nearest configured root containing
 * `cwd`, or a single configured root as a fallback when work happens outside
 * it. Otherwise the nearest managed ancestor of `cwd` is used.
 */
export function findWorkspaceDirectory(input: {
	cwd: string;
	personasDirectory: string;
	workspaceRoots?: string[];
}): string | undefined {
	const roots = input.workspaceRoots ?? [];
	if (roots.length > 0) {
		const resolvedCwd = path.resolve(input.cwd);
		const containing = roots
			.map((root) => path.resolve(root))
			.filter((root) => isWithin(root, resolvedCwd))
			.sort((left, right) => right.length - left.length);
		if (containing[0]) return containing[0];
		return roots.length === 1 ? path.resolve(roots[0]!) : undefined;
	}

	for (const directory of ancestors(input.cwd)) {
		if (isWorkspaceRoot(directory, input.personasDirectory)) return directory;
	}
	return undefined;
}

/** Classify the persona installed as Pi's global context file. */
export function resolveProfile(agentDirectory: string, personasDirectory: string): WorkspaceProfile {
	const contextFile = path.join(agentDirectory, CONTEXT_FILE_NAME);
	if (!isFile(contextFile)) return "missing";

	const resolved = realpathOrUndefined(contextFile);
	if (!resolved || !isWithin(personasDirectory, resolved)) return "unmanaged";

	const name = path.basename(resolved);
	if (name === STRICT_PROFILE_FILE) return "strict";
	if (name === STANDARD_PROFILE_FILE) return "standard";
	return "unmanaged";
}

function describeGuidanceLink(contextFile: string, personasDirectory: string, loaded: Set<string>): GuidanceLink {
	const resolved = realpathOrUndefined(contextFile);
	const managed = resolved !== undefined && isWithin(personasDirectory, resolved);
	return {
		path: contextFile,
		target: managed ? resolved : undefined,
		managed,
		loaded: loaded.has(contextFile) || (resolved !== undefined && loaded.has(resolved)),
	};
}

/** Collect every fact the agent would otherwise have to derive by hand. */
export function resolveJihyeSetupFacts(input: ResolveFactsInput): JihyeSetupFacts {
	const { packageRoot, personasDirectory } = resolvePackagePaths(input.extensionDirectory);
	const workspaceDirectory = findWorkspaceDirectory({
		cwd: input.cwd,
		personasDirectory,
		workspaceRoots: input.workspaceRoots,
	});

	const loaded = new Set<string>();
	for (const file of input.loadedContextFiles ?? []) {
		loaded.add(path.resolve(file));
		const resolved = realpathOrUndefined(file);
		if (resolved) loaded.add(resolved);
	}

	const guidance = [describeGuidanceLink(path.join(input.agentDirectory, CONTEXT_FILE_NAME), personasDirectory, loaded)];
	if (workspaceDirectory) {
		guidance.push(describeGuidanceLink(path.join(workspaceDirectory, CONTEXT_FILE_NAME), personasDirectory, loaded));
	}

	const localEnvironmentFiles: string[] = [];
	const missingLocalEnvironmentFiles: string[] = [];
	if (workspaceDirectory) {
		for (const file of LOCAL_ENVIRONMENT_FILES) {
			const candidate = path.join(workspaceDirectory, file);
			if (isFile(candidate)) localEnvironmentFiles.push(candidate);
			else missingLocalEnvironmentFiles.push(candidate);
		}
	}

	return {
		packageRoot,
		personasDirectory,
		agentDirectory: input.agentDirectory,
		workspaceDirectory,
		profile: resolveProfile(input.agentDirectory, personasDirectory),
		localEnvironmentFiles,
		missingLocalEnvironmentFiles,
		guidance,
	};
}

/**
 * Bundled extension names that were also copied into Pi's agent directory.
 *
 * Manual copies predate `pi install` and load alongside the package, which
 * duplicates tools and flags.
 */
export function findLegacyExtensionCopies(agentDirectory: string, packageRoot: string): string[] {
	const installedDirectory = path.join(agentDirectory, "extensions");
	const bundled = new Set(readDirectoryNames(path.join(packageRoot, "extensions")));
	if (bundled.size === 0) return [];
	return readDirectoryNames(installedDirectory).filter((name) => bundled.has(name)).sort();
}

function readDirectoryNames(directory: string): string[] {
	try {
		return fs.readdirSync(directory);
	} catch {
		return [];
	}
}

/**
 * Facts appended to the system prompt. Keeps the wording declarative so the
 * agent treats the paths as given rather than as something to recompute.
 */
export function formatFactBlock(facts: JihyeSetupFacts): string {
	const lines = [
		"## Jihye Setup (resolved paths — use directly, do not re-derive)",
		"",
		`- jihye_package: ${facts.packageRoot}`,
		`- personas_directory: ${facts.personasDirectory}`,
		`- workspace_profile: ${facts.profile}`,
	];

	if (facts.workspaceDirectory) {
		lines.push(`- workspace_directory: ${facts.workspaceDirectory}`);
	} else {
		lines.push("- workspace_directory: unresolved (no managed workspace root above the working directory)");
	}

	if (facts.localEnvironmentFiles.length > 0) {
		lines.push(`- local_environment: ${facts.localEnvironmentFiles.join(", ")}`);
	}
	if (facts.missingLocalEnvironmentFiles.length > 0) {
		lines.push(`- local_environment_missing: ${facts.missingLocalEnvironmentFiles.join(", ")}`);
	}

	for (const link of facts.guidance) {
		const target = link.managed && link.target ? ` → ${link.target}` : " (not managed by Jihye)";
		lines.push(`- guidance: ${link.path}${target}${link.loaded ? " [loaded]" : " [not loaded]"}`);
	}

	return lines.join("\n");
}
