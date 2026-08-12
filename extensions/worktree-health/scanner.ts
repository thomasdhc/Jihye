import {
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import * as path from "node:path";

export interface CommandResult {
	stdout: string;
	stderr: string;
	code: number | null;
}

export interface CommandOptions {
	cwd?: string;
	timeout?: number;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options?: CommandOptions,
) => Promise<CommandResult>;

export type WorktreeHealthState =
	| "current"
	| "dirty"
	| "merged"
	| "upstream-gone"
	| "prunable"
	| "dangling"
	| "unknown";

export interface WorktreeHealthItem {
	path: string;
	state: WorktreeHealthState;
	candidate: boolean;
	branch?: string;
	repositoryRoot?: string;
	detail: string;
}

export interface WorktreeHealthRepository {
	root: string;
	commonDirectory?: string;
	baseRef?: string;
}

export interface WorktreeHealthReport {
	workspaceDirectory?: string;
	worktreeRoot?: string;
	repositoryCheckoutRoot?: string;
	repositoryRoot?: string;
	baseRef?: string;
	repositories?: WorktreeHealthRepository[];
	items: WorktreeHealthItem[];
	warnings: string[];
}

interface RegisteredWorktree {
	path: string;
	head?: string;
	branchRef?: string;
	detached: boolean;
	locked?: string;
	prunable?: string;
}

export interface ConfiguredWorkspacePath {
	path?: string;
	warning?: string;
}

export type ConfiguredWorktreeRoot = ConfiguredWorkspacePath;

const WORKTREE_ROOT_PREFIX = "- Parallel and isolated worktrees:";
const REPOSITORY_ROOT_PREFIX = "- Repository checkouts:";
const GIT_TIMEOUT_MS = 5000;
const WORKTREE_DISCOVERY_MAX_DEPTH = 4;
const REPOSITORY_DISCOVERY_MAX_DEPTH = 2;
const DISCOVERY_MAX_DIRECTORIES = 2000;
const DISCOVERY_EXAMPLE_LIMIT = 5;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function canonicalPath(target: string): string {
	try {
		return realpathSync(target);
	} catch {
		return path.resolve(target);
	}
}

function isWithin(parent: string, candidate: string): boolean {
	const relative = path.relative(canonicalPath(parent), canonicalPath(candidate));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseConfiguredAbsolutePath(
	content: string,
	prefix: string,
	label: string,
	source: string,
): ConfiguredWorkspacePath {
	const values = content
		.split(/\r?\n/)
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length).trim())
		.map((value) => value.match(/^`([^`]+)`$/)?.[1]?.trim())
		.filter((value): value is string => value !== undefined && value !== "");

	if (values.length === 0) {
		return { warning: `${source} does not declare an absolute ${label} path` };
	}
	if (values.length > 1) {
		return { warning: `${source} declares more than one ${label} path` };
	}
	if (!path.isAbsolute(values[0]!)) {
		return { warning: `${source} ${label} path must be absolute: ${values[0]}` };
	}
	return { path: path.normalize(values[0]!) };
}

export function parseConfiguredWorktreeRoot(content: string, source = "REPO.md"): ConfiguredWorktreeRoot {
	return parseConfiguredAbsolutePath(content, WORKTREE_ROOT_PREFIX, "parallel-worktree", source);
}

export function parseConfiguredRepositoryRoot(content: string, source = "REPO.md"): ConfiguredWorkspacePath {
	return parseConfiguredAbsolutePath(content, REPOSITORY_ROOT_PREFIX, "repository-checkout", source);
}

function readConfiguredPath(
	workspaceDirectory: string,
	parse: (content: string, source: string) => ConfiguredWorkspacePath,
): ConfiguredWorkspacePath {
	const source = path.join(workspaceDirectory, "REPO.md");
	try {
		return parse(readFileSync(source, "utf8"), source);
	} catch (error) {
		return { warning: `Cannot read ${source}: ${errorMessage(error)}` };
	}
}

export function readConfiguredWorktreeRoot(workspaceDirectory: string): ConfiguredWorktreeRoot {
	return readConfiguredPath(workspaceDirectory, parseConfiguredWorktreeRoot);
}

export function readConfiguredRepositoryRoot(workspaceDirectory: string): ConfiguredWorkspacePath {
	return readConfiguredPath(workspaceDirectory, parseConfiguredRepositoryRoot);
}

export function parseWorktreePorcelain(output: string): RegisteredWorktree[] {
	const worktrees: RegisteredWorktree[] = [];
	let current: RegisteredWorktree | undefined;

	const finish = () => {
		if (current) worktrees.push(current);
		current = undefined;
	};

	for (const line of output.split(/\r?\n/)) {
		if (line === "") {
			finish();
			continue;
		}
		if (line.startsWith("worktree ")) {
			finish();
			current = { path: line.slice("worktree ".length), detached: false };
			continue;
		}
		if (!current) continue;
		if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
		else if (line.startsWith("branch ")) current.branchRef = line.slice("branch ".length);
		else if (line === "detached") current.detached = true;
		else if (line === "locked" || line.startsWith("locked ")) current.locked = line.slice("locked".length).trim();
		else if (line === "prunable" || line.startsWith("prunable ")) current.prunable = line.slice("prunable".length).trim();
	}
	finish();
	return worktrees;
}

async function run(
	runner: CommandRunner,
	args: string[],
	cwd: string,
): Promise<CommandResult | undefined> {
	try {
		return await runner("git", ["--no-optional-locks", ...args], { cwd, timeout: GIT_TIMEOUT_MS });
	} catch {
		return undefined;
	}
}

async function resolveRepositoryRoot(runner: CommandRunner, cwd: string): Promise<string | undefined> {
	const result = await run(runner, ["rev-parse", "--show-toplevel"], cwd);
	if (!result || result.code !== 0) return undefined;
	const root = result.stdout.trim();
	return root ? canonicalPath(root) : undefined;
}

async function resolveGitCommonDirectory(runner: CommandRunner, cwd: string): Promise<string | undefined> {
	const result = await run(runner, ["rev-parse", "--git-common-dir"], cwd);
	if (!result || result.code !== 0) return undefined;
	const value = result.stdout.trim();
	if (!value) return undefined;
	return canonicalPath(path.isAbsolute(value) ? value : path.resolve(cwd, value));
}

async function resolveBaseRef(runner: CommandRunner, repositoryRoot: string): Promise<string | undefined> {
	const symbolic = await run(runner, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repositoryRoot);
	const candidates = [symbolic?.code === 0 ? symbolic.stdout.trim() : "", "origin/main", "main"].filter(Boolean);

	for (const candidate of [...new Set(candidates)]) {
		const result = await run(runner, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], repositoryRoot);
		if (result?.code === 0) return candidate;
	}
	return undefined;
}

async function branchUpstream(
	runner: CommandRunner,
	repositoryRoot: string,
	branchRef: string,
): Promise<{ upstream?: string; gone: boolean }> {
	const result = await run(
		runner,
		["for-each-ref", "--format=%(upstream:short)%00%(upstream:track)", branchRef],
		repositoryRoot,
	);
	if (!result || result.code !== 0 || result.stdout === "") return { gone: false };
	const [upstreamValue = "", trackValue = ""] = result.stdout.trimEnd().split("\0");
	const upstream = upstreamValue.trim() || undefined;
	return { upstream, gone: trackValue.includes("[gone]") };
}

function branchName(branchRef?: string): string | undefined {
	return branchRef?.replace(/^refs\/heads\//, "");
}

async function inspectRegisteredWorktree(input: {
	runner: CommandRunner;
	repositoryRoot: string;
	cwd: string;
	worktree: RegisteredWorktree;
	baseRef?: string;
}): Promise<WorktreeHealthItem> {
	const { runner, repositoryRoot, cwd, worktree, baseRef } = input;
	const branch = branchName(worktree.branchRef);

	if (worktree.locked !== undefined) {
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			branch,
			detail: worktree.locked ? `locked: ${worktree.locked}` : "locked worktree",
		};
	}
	if (worktree.prunable !== undefined) {
		return {
			path: worktree.path,
			state: "prunable",
			candidate: true,
			branch,
			detail: worktree.prunable || "Git marks the registration prunable",
		};
	}
	if (!existsSync(worktree.path)) {
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			branch,
			detail: "registered path is inaccessible; availability is unknown",
		};
	}
	if (isWithin(worktree.path, cwd)) {
		return {
			path: worktree.path,
			state: "current",
			candidate: false,
			branch,
			detail: "current session worktree",
		};
	}
	const status = await run(runner, ["status", "--porcelain", "--untracked-files=normal"], worktree.path);
	if (!status || status.code !== 0) {
		const dangling = inspectGitdirPointer(worktree.path);
		if (dangling) return { ...dangling, branch };
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			branch,
			detail: "status could not be read",
		};
	}
	const changedPaths = status.stdout.split(/\r?\n/).filter(Boolean).length;
	if (changedPaths > 0) {
		return {
			path: worktree.path,
			state: "dirty",
			candidate: false,
			branch,
			detail: `${changedPaths} changed path${changedPaths === 1 ? "" : "s"}; protected from cleanup`,
		};
	}
	if (!worktree.branchRef || worktree.detached) {
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			detail: "clean detached worktree; intent is unknown",
		};
	}

	const upstream = await branchUpstream(runner, repositoryRoot, worktree.branchRef);
	if (upstream.gone) {
		return {
			path: worktree.path,
			state: "upstream-gone",
			candidate: true,
			branch,
			detail: "clean worktree whose configured upstream is gone",
		};
	}
	if (!upstream.upstream) {
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			branch,
			detail: "clean branch without an upstream; intent is unknown",
		};
	}
	if (!baseRef || !worktree.head) {
		return {
			path: worktree.path,
			state: "unknown",
			candidate: false,
			branch,
			detail: "clean tracked branch, but no local base ref could be resolved",
		};
	}

	const ancestry = await run(runner, ["merge-base", "--is-ancestor", worktree.head, baseRef], repositoryRoot);
	if (ancestry?.code === 0) {
		return {
			path: worktree.path,
			state: "merged",
			candidate: true,
			branch,
			detail: `clean tracked branch is contained in local ${baseRef}`,
		};
	}
	return {
		path: worktree.path,
		state: "unknown",
		candidate: false,
		branch,
		detail: `clean tracked branch is not contained in local ${baseRef}`,
	};
}

interface GitdirPointer {
	target: string;
	missing: boolean;
}

interface DiscoveryCoverage {
	limitReached: boolean;
	skippedPaths: string[];
	unreadablePaths: string[];
	symbolicLinkPaths: string[];
}

export interface WorktreeRootDiscovery extends DiscoveryCoverage {
	linkedWorktrees: string[];
	dangling: WorktreeHealthItem[];
}

export interface RepositoryRootDiscovery extends DiscoveryCoverage {
	checkouts: string[];
}

function readGitdirPointer(directory: string): GitdirPointer | undefined {
	const gitFile = path.join(directory, ".git");
	let stat;
	try {
		stat = lstatSync(gitFile);
	} catch {
		return undefined;
	}
	if (!stat.isFile()) return undefined;

	let content: string;
	try {
		content = readFileSync(gitFile, "utf8");
	} catch {
		return undefined;
	}
	const targetValue = content.match(/^gitdir:\s*(.+?)\s*$/m)?.[1];
	if (!targetValue) return undefined;
	const target = path.isAbsolute(targetValue) ? targetValue : path.resolve(directory, targetValue);
	return { target, missing: !existsSync(target) };
}

function inspectGitdirPointer(directory: string): WorktreeHealthItem | undefined {
	const pointer = readGitdirPointer(directory);
	if (!pointer?.missing) return undefined;
	return {
		path: directory,
		state: "dangling",
		candidate: true,
		detail: `gitdir target is missing: ${pointer.target}; manual review required`,
	};
}

interface QueuedDirectory {
	directory: string;
	depth: number;
}

interface ChildDirectories {
	directories: string[];
	symbolicLinks: string[];
}

function childDirectories(directory: string): ChildDirectories | undefined {
	try {
		const directories: string[] = [];
		const symbolicLinks: string[] = [];
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const target = path.join(directory, entry.name);
			if (entry.isDirectory()) directories.push(target);
			else if (entry.isSymbolicLink()) {
				try {
					if (statSync(target).isDirectory()) symbolicLinks.push(target);
				} catch {
					symbolicLinks.push(target);
				}
			}
		}
		return {
			directories: directories.sort((left, right) => left.localeCompare(right)),
			symbolicLinks: symbolicLinks.sort((left, right) => left.localeCompare(right)),
		};
	} catch {
		return undefined;
	}
}

function addExamples(target: string[], values: string[]): void {
	for (const value of values) {
		if (target.length >= DISCOVERY_EXAMPLE_LIMIT) return;
		if (!target.includes(value)) target.push(value);
	}
}

export function discoverWorktreeRoot(
	worktreeRoot: string,
	maxDepth = WORKTREE_DISCOVERY_MAX_DEPTH,
	maxDirectories = DISCOVERY_MAX_DIRECTORIES,
): WorktreeRootDiscovery {
	const linkedWorktrees: string[] = [];
	const dangling: WorktreeHealthItem[] = [];
	const linkedPaths = new Set<string>();
	const danglingPaths = new Set<string>();
	const skippedPaths: string[] = [];
	const unreadablePaths: string[] = [];
	const symbolicLinkPaths: string[] = [];
	const queue: QueuedDirectory[] = [{ directory: worktreeRoot, depth: 0 }];
	let queueIndex = 0;
	let limitReached = false;

	while (existsSync(worktreeRoot) && queueIndex < queue.length) {
		if (queueIndex >= maxDirectories) {
			limitReached = true;
			addExamples(skippedPaths, queue.slice(queueIndex).map((entry) => entry.directory));
			break;
		}
		const { directory, depth } = queue[queueIndex++]!;
		const pointer = readGitdirPointer(directory);
		if (pointer) {
			const key = canonicalPath(directory);
			if (pointer.missing) {
				if (!danglingPaths.has(key)) {
					danglingPaths.add(key);
					dangling.push({
						path: directory,
						state: "dangling",
						candidate: true,
						detail: `gitdir target is missing: ${pointer.target}; manual review required`,
					});
				}
			} else if (!linkedPaths.has(key)) {
				linkedPaths.add(key);
				linkedWorktrees.push(directory);
			}
			continue;
		}

		try {
			lstatSync(path.join(directory, ".git"));
			continue;
		} catch {
			// No Git marker: this may be a grouping directory under the configured root.
		}
		const children = childDirectories(directory);
		if (!children) {
			addExamples(unreadablePaths, [directory]);
			continue;
		}
		addExamples(symbolicLinkPaths, children.symbolicLinks);
		if (depth >= maxDepth) {
			if (children.directories.length > 0) {
				limitReached = true;
				addExamples(skippedPaths, children.directories);
			}
			continue;
		}
		queue.push(...children.directories.map((child) => ({ directory: child, depth: depth + 1 })));
	}

	linkedWorktrees.sort((left, right) => left.localeCompare(right));
	dangling.sort((left, right) => left.path.localeCompare(right.path));
	return { linkedWorktrees, dangling, limitReached, skippedPaths, unreadablePaths, symbolicLinkPaths };
}

export function discoverRepositoryRoot(
	repositoryCheckoutRoot: string,
	maxDepth = REPOSITORY_DISCOVERY_MAX_DEPTH,
	maxDirectories = DISCOVERY_MAX_DIRECTORIES,
): RepositoryRootDiscovery {
	const checkouts: string[] = [];
	const skippedPaths: string[] = [];
	const unreadablePaths: string[] = [];
	const symbolicLinkPaths: string[] = [];
	const queue: QueuedDirectory[] = [{ directory: repositoryCheckoutRoot, depth: 0 }];
	let queueIndex = 0;
	let limitReached = false;

	while (existsSync(repositoryCheckoutRoot) && queueIndex < queue.length) {
		if (queueIndex >= maxDirectories) {
			limitReached = true;
			addExamples(skippedPaths, queue.slice(queueIndex).map((entry) => entry.directory));
			break;
		}
		const { directory, depth } = queue[queueIndex++]!;
		try {
			lstatSync(path.join(directory, ".git"));
			checkouts.push(directory);
			continue;
		} catch {
			// No Git marker: descend only through the bounded checkout-root hierarchy.
		}
		const children = childDirectories(directory);
		if (!children) {
			addExamples(unreadablePaths, [directory]);
			continue;
		}
		addExamples(symbolicLinkPaths, children.symbolicLinks);
		if (depth >= maxDepth) {
			if (children.directories.length > 0) {
				limitReached = true;
				addExamples(skippedPaths, children.directories);
			}
			continue;
		}
		queue.push(...children.directories.map((child) => ({ directory: child, depth: depth + 1 })));
	}

	checkouts.sort((left, right) => left.localeCompare(right));
	return { checkouts, limitReached, skippedPaths, unreadablePaths, symbolicLinkPaths };
}

export function findDanglingWorktreeDirectories(worktreeRoot: string, maxDepth = 2): WorktreeHealthItem[] {
	return discoverWorktreeRoot(worktreeRoot, maxDepth).dangling;
}

function appendDiscoveryWarnings(
	warnings: string[],
	label: string,
	root: string,
	coverage: DiscoveryCoverage,
	maxDepth: number,
): void {
	if (coverage.limitReached) {
		const examples = coverage.skippedPaths.length > 0
			? `; unscanned examples: ${coverage.skippedPaths.join(", ")}`
			: "";
		warnings.push(
			`${label} discovery is incomplete at its bounds (depth ${maxDepth}, ${DISCOVERY_MAX_DIRECTORIES} directories)${examples}`,
		);
	}
	if (coverage.unreadablePaths.length > 0) {
		warnings.push(`${label} discovery could not read: ${coverage.unreadablePaths.join(", ")}; those paths remain protected`);
	}
	if (coverage.symbolicLinkPaths.length > 0) {
		warnings.push(
			`${label} discovery does not follow symbolic-link directories: ${coverage.symbolicLinkPaths.join(", ")}; those paths remain protected`,
		);
	}
	if (!existsSync(root)) warnings.push(`${label} does not exist or is inaccessible: ${root}`);
}

export async function scanWorktreeHealth(input: {
	cwd: string;
	runner: CommandRunner;
	workspaceDirectory?: string;
	worktreeRoot?: string;
	repositoryCheckoutRoot?: string;
	warnings?: string[];
}): Promise<WorktreeHealthReport> {
	const warnings = [...(input.warnings ?? [])];
	const currentRepositoryRoot = await resolveRepositoryRoot(input.runner, input.cwd);
	const currentBaseRef = currentRepositoryRoot
		? await resolveBaseRef(input.runner, input.cwd)
		: undefined;
	const targets = new Map<string, { cwd: string; commonDirectory?: string; current: boolean }>();
	const items: WorktreeHealthItem[] = [];
	const itemPaths = new Set<string>();
	const repositories: WorktreeHealthRepository[] = [];
	let worktreeDiscovery: WorktreeRootDiscovery | undefined;

	const addTarget = async (cwd: string, current: boolean) => {
		const commonDirectory = await resolveGitCommonDirectory(input.runner, cwd);
		if (!commonDirectory) {
			if (!current) {
				warnings.push(`Cannot resolve Git common repository for ${cwd}; it remains protected`);
				return;
			}
			const key = `current:${canonicalPath(currentRepositoryRoot ?? cwd)}`;
			targets.set(key, { cwd, current: true });
			return;
		}
		const existing = targets.get(commonDirectory);
		if (!existing) {
			targets.set(commonDirectory, { cwd, commonDirectory, current });
		} else if (current) {
			targets.set(commonDirectory, { cwd, commonDirectory, current: true });
		}
	};

	if (currentRepositoryRoot) await addTarget(input.cwd, true);

	if (input.repositoryCheckoutRoot) {
		const repositoryDiscovery = discoverRepositoryRoot(input.repositoryCheckoutRoot);
		appendDiscoveryWarnings(
			warnings,
			"Repository-root",
			input.repositoryCheckoutRoot,
			repositoryDiscovery,
			REPOSITORY_DISCOVERY_MAX_DEPTH,
		);
		for (const checkout of repositoryDiscovery.checkouts) await addTarget(checkout, false);
	}

	if (input.worktreeRoot) {
		worktreeDiscovery = discoverWorktreeRoot(input.worktreeRoot);
		appendDiscoveryWarnings(
			warnings,
			"Worktree-root",
			input.worktreeRoot,
			worktreeDiscovery,
			WORKTREE_DISCOVERY_MAX_DEPTH,
		);
		for (const linkedWorktree of worktreeDiscovery.linkedWorktrees) await addTarget(linkedWorktree, false);
	}

	const auditedRepositoryRoots = new Set<string>();
	for (const target of targets.values()) {
		const list = await run(input.runner, ["worktree", "list", "--porcelain"], target.cwd);
		if (!list || list.code !== 0) {
			warnings.push(`Cannot list worktrees for ${target.cwd}`);
			continue;
		}
		const registered = parseWorktreePorcelain(list.stdout);
		const repositoryRoot = registered[0]?.path
			? canonicalPath(registered[0].path)
			: await resolveRepositoryRoot(input.runner, target.cwd);
		if (!repositoryRoot) {
			warnings.push(`Cannot resolve repository root for ${target.cwd}`);
			continue;
		}
		if (auditedRepositoryRoots.has(repositoryRoot)) continue;
		auditedRepositoryRoots.add(repositoryRoot);

		const baseRef = target.current && currentBaseRef
			? currentBaseRef
			: await resolveBaseRef(input.runner, target.cwd);
		repositories.push({ root: repositoryRoot, commonDirectory: target.commonDirectory, baseRef });

		for (const worktree of registered.slice(1)) {
			const item = await inspectRegisteredWorktree({
				runner: input.runner,
				repositoryRoot: target.cwd,
				cwd: input.cwd,
				worktree,
				baseRef,
			});
			const key = canonicalPath(item.path);
			if (itemPaths.has(key)) continue;
			itemPaths.add(key);
			items.push({ ...item, repositoryRoot });
		}
	}

	for (const dangling of worktreeDiscovery?.dangling ?? []) {
		const key = canonicalPath(dangling.path);
		if (itemPaths.has(key)) continue;
		itemPaths.add(key);
		items.push(dangling);
	}

	repositories.sort((left, right) => left.root.localeCompare(right.root));
	items.sort((left, right) =>
		Number(right.candidate) - Number(left.candidate)
		|| (left.repositoryRoot ?? "").localeCompare(right.repositoryRoot ?? "")
		|| left.path.localeCompare(right.path));
	return {
		workspaceDirectory: input.workspaceDirectory,
		worktreeRoot: input.worktreeRoot,
		repositoryCheckoutRoot: input.repositoryCheckoutRoot,
		repositoryRoot: currentRepositoryRoot,
		baseRef: currentBaseRef,
		repositories,
		items,
		warnings,
	};
}

function formatItem(item: WorktreeHealthItem): string {
	const branch = item.branch ? ` (${item.branch})` : "";
	const repository = item.repositoryRoot ? `repository ${item.repositoryRoot}; ` : "";
	return `- [${item.state}] ${item.path}${branch} — ${repository}${item.detail}`;
}

export function formatWorktreeHealthReport(report: WorktreeHealthReport): string {
	const candidates = report.items.filter((item) => item.candidate);
	const retained = report.items.filter((item) => !item.candidate);
	const repositories = report.repositories ?? (report.repositoryRoot ? [{
		root: report.repositoryRoot,
		baseRef: report.baseRef,
	}] : []);
	const lines = [
		"Worktree health (read-only, local refs)",
		`Workspace: ${report.workspaceDirectory ?? "unresolved"}`,
		`Configured repository root: ${report.repositoryCheckoutRoot ?? "unresolved"}`,
		`Configured worktree root: ${report.worktreeRoot ?? "unresolved"}`,
		`Current repository: ${report.repositoryRoot ?? "none"}`,
		`Current local base: ${report.baseRef ?? "unresolved"}`,
		`Repositories audited (${repositories.length})`,
		...repositories.map((repository) =>
			`- ${repository.root} — local base: ${repository.baseRef ?? "unresolved"}`),
		"",
		`Cleanup candidates (${candidates.length})`,
		...(candidates.length > 0 ? candidates.map(formatItem) : ["- None"]),
	];

	if (retained.length > 0) {
		lines.push("", `Retained or protected (${retained.length})`, ...retained.map(formatItem));
	}
	if (report.warnings.length > 0) {
		lines.push("", "Warnings", ...report.warnings.map((warning) => `- ${warning}`));
	}
	lines.push("", "Candidates are advisory. Recheck state and obtain approval before removal or pruning.");
	return lines.join("\n");
}
