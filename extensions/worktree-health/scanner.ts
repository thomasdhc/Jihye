import {
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	realpathSync,
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
	detail: string;
}

export interface WorktreeHealthReport {
	workspaceDirectory?: string;
	worktreeRoot?: string;
	repositoryRoot?: string;
	baseRef?: string;
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

export interface ConfiguredWorktreeRoot {
	path?: string;
	warning?: string;
}

const WORKTREE_ROOT_PREFIX = "- Parallel and isolated worktrees:";
const GIT_TIMEOUT_MS = 5000;

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

export function parseConfiguredWorktreeRoot(content: string, source = "REPO.md"): ConfiguredWorktreeRoot {
	const values = content
		.split(/\r?\n/)
		.filter((line) => line.startsWith(WORKTREE_ROOT_PREFIX))
		.map((line) => line.slice(WORKTREE_ROOT_PREFIX.length).trim())
		.map((value) => value.match(/^`([^`]+)`$/)?.[1]?.trim())
		.filter((value): value is string => value !== undefined && value !== "");

	if (values.length === 0) {
		return { warning: `${source} does not declare an absolute parallel-worktree path` };
	}
	if (values.length > 1) {
		return { warning: `${source} declares more than one parallel-worktree path` };
	}
	if (!path.isAbsolute(values[0]!)) {
		return { warning: `${source} parallel-worktree path must be absolute: ${values[0]}` };
	}
	return { path: path.normalize(values[0]!) };
}

export function readConfiguredWorktreeRoot(workspaceDirectory: string): ConfiguredWorktreeRoot {
	const source = path.join(workspaceDirectory, "REPO.md");
	try {
		return parseConfiguredWorktreeRoot(readFileSync(source, "utf8"), source);
	} catch (error) {
		return { warning: `Cannot read ${source}: ${errorMessage(error)}` };
	}
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
		return await runner("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
	} catch {
		return undefined;
	}
}

async function resolveRepositoryRoot(runner: CommandRunner, cwd: string): Promise<string | undefined> {
	const result = await run(runner, ["rev-parse", "--show-toplevel"], cwd);
	if (!result || result.code !== 0) return undefined;
	const root = result.stdout.trim();
	return root ? path.resolve(root) : undefined;
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

function inspectGitdirPointer(directory: string): WorktreeHealthItem | undefined {
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
	if (existsSync(target)) return undefined;
	return {
		path: directory,
		state: "dangling",
		candidate: true,
		detail: `gitdir target is missing: ${target}; manual review required`,
	};
}

export function findDanglingWorktreeDirectories(worktreeRoot: string, maxDepth = 2): WorktreeHealthItem[] {
	if (!existsSync(worktreeRoot)) return [];
	const found: WorktreeHealthItem[] = [];

	const visit = (directory: string, depth: number) => {
		let entries;
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
			const candidate = path.join(directory, entry.name);
			const pointer = inspectGitdirPointer(candidate);
			if (pointer) {
				found.push(pointer);
				continue;
			}
			if (existsSync(path.join(candidate, ".git"))) continue;
			if (depth + 1 < maxDepth) visit(candidate, depth + 1);
		}
	};

	visit(worktreeRoot, 0);
	return found;
}

export async function scanWorktreeHealth(input: {
	cwd: string;
	runner: CommandRunner;
	workspaceDirectory?: string;
	worktreeRoot?: string;
	warnings?: string[];
}): Promise<WorktreeHealthReport> {
	const warnings = [...(input.warnings ?? [])];
	const repositoryRoot = await resolveRepositoryRoot(input.runner, input.cwd);
	const baseRef = repositoryRoot ? await resolveBaseRef(input.runner, repositoryRoot) : undefined;
	const items: WorktreeHealthItem[] = [];

	if (repositoryRoot) {
		const list = await run(input.runner, ["worktree", "list", "--porcelain"], repositoryRoot);
		if (!list || list.code !== 0) {
			warnings.push(`Cannot list worktrees for ${repositoryRoot}`);
		} else {
			const registered = parseWorktreePorcelain(list.stdout);
			for (const worktree of registered.slice(1)) {
				items.push(await inspectRegisteredWorktree({
					runner: input.runner,
					repositoryRoot,
					cwd: input.cwd,
					worktree,
					baseRef,
				}));
			}
		}
	}

	if (input.worktreeRoot) {
		const registeredPaths = new Set(items.map((item) => canonicalPath(item.path)));
		for (const dangling of findDanglingWorktreeDirectories(input.worktreeRoot)) {
			if (!registeredPaths.has(canonicalPath(dangling.path))) items.push(dangling);
		}
	}

	items.sort((left, right) => Number(right.candidate) - Number(left.candidate) || left.path.localeCompare(right.path));
	return {
		workspaceDirectory: input.workspaceDirectory,
		worktreeRoot: input.worktreeRoot,
		repositoryRoot,
		baseRef,
		items,
		warnings,
	};
}

function formatItem(item: WorktreeHealthItem): string {
	const branch = item.branch ? ` (${item.branch})` : "";
	return `- [${item.state}] ${item.path}${branch} — ${item.detail}`;
}

export function formatWorktreeHealthReport(report: WorktreeHealthReport): string {
	const candidates = report.items.filter((item) => item.candidate);
	const retained = report.items.filter((item) => !item.candidate);
	const lines = [
		"Worktree health (read-only, local refs)",
		`Workspace: ${report.workspaceDirectory ?? "unresolved"}`,
		`Configured root: ${report.worktreeRoot ?? "unresolved"}`,
		`Current repository: ${report.repositoryRoot ?? "none"}`,
		`Local base: ${report.baseRef ?? "unresolved"}`,
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
