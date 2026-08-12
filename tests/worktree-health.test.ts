import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createWorktreeHealthExtension } from "../extensions/worktree-health/index.ts";
import {
	findDanglingWorktreeDirectories,
	formatWorktreeHealthReport,
	parseConfiguredWorktreeRoot,
	parseWorktreePorcelain,
	scanWorktreeHealth,
	type CommandRunner,
	type WorktreeHealthReport,
} from "../extensions/worktree-health/scanner.ts";

const runner: CommandRunner = async (command, args, options) => {
	const result = spawnSync(command, args, {
		cwd: options?.cwd,
		encoding: "utf8",
		timeout: options?.timeout,
	});
	if (result.error) throw result.error;
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.status,
	};
};

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

function createGitFixture() {
	const root = mkdtempSync(join(tmpdir(), "worktree-health-"));
	const repository = join(root, "repository");
	const worktreeRoot = join(root, "worktrees");
	const featureWorktree = join(worktreeRoot, "feature");
	mkdirSync(repository, { recursive: true });
	mkdirSync(worktreeRoot, { recursive: true });

	git(repository, "init", "-b", "main");
	git(repository, "config", "user.name", "Fixture");
	git(repository, "config", "user.email", "fixture@example.invalid");
	writeFileSync(join(repository, "tracked.txt"), "initial\n");
	git(repository, "add", "tracked.txt");
	git(repository, "commit", "--no-gpg-sign", "-m", "initial");
	git(repository, "remote", "add", "origin", repository);
	git(repository, "update-ref", "refs/remotes/origin/main", "HEAD");
	git(repository, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
	git(repository, "branch", "feature");
	git(repository, "update-ref", "refs/remotes/origin/feature", "feature");
	git(repository, "branch", "--set-upstream-to=origin/feature", "feature");
	git(repository, "worktree", "add", featureWorktree, "feature");

	return {
		root,
		repository,
		worktreeRoot,
		featureWorktree,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("reads the configured absolute worktree root from REPO.md prose", () => {
	assert.deepEqual(
		parseConfiguredWorktreeRoot("# Workspace\n\n- Parallel and isolated worktrees: `/srv/worktrees`\n", "fixture"),
		{ path: "/srv/worktrees" },
	);
	assert.match(parseConfiguredWorktreeRoot("# Workspace\n", "fixture").warning ?? "", /does not declare/);
	assert.match(
		parseConfiguredWorktreeRoot("- Parallel and isolated worktrees: `tmp/worktrees`\n", "fixture").warning ?? "",
		/must be absolute/,
	);
});

test("parses registered worktree porcelain records", () => {
	assert.deepEqual(parseWorktreePorcelain([
		"worktree /repo",
		"HEAD aaaaaaa",
		"branch refs/heads/main",
		"",
		"worktree /tmp/feature",
		"HEAD bbbbbbb",
		"branch refs/heads/feature",
		"locked retained for review",
		"",
	].join("\n")), [
		{ path: "/repo", head: "aaaaaaa", branchRef: "refs/heads/main", detached: false },
		{
			path: "/tmp/feature",
			head: "bbbbbbb",
			branchRef: "refs/heads/feature",
			detached: false,
			locked: "retained for review",
		},
	]);
});

test("classifies clean merged worktrees and dangling pointers as cleanup candidates", async () => {
	const fixture = createGitFixture();
	try {
		const dangling = join(fixture.worktreeRoot, "dangling");
		mkdirSync(dangling);
		writeFileSync(join(dangling, ".git"), `gitdir: ${join(fixture.root, "missing", "gitdir")}\n`);

		const report = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			workspaceDirectory: fixture.root,
			worktreeRoot: fixture.worktreeRoot,
		});

		assert.equal(report.baseRef, "origin/main");
		assert.deepEqual(
			report.items.filter((item) => item.candidate).map((item) => item.state).sort(),
			["dangling", "merged"],
		);
		assert.match(formatWorktreeHealthReport(report), /Candidates are advisory/);
	} finally {
		fixture.cleanup();
	}
});

test("protects dirty and current worktrees from cleanup classification", async () => {
	const fixture = createGitFixture();
	try {
		writeFileSync(join(fixture.featureWorktree, "untracked.txt"), "keep me\n");
		const dirty = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(dirty.items[0]?.state, "dirty");
		assert.equal(dirty.items[0]?.candidate, false);

		rmSync(join(fixture.featureWorktree, "untracked.txt"));
		const current = await scanWorktreeHealth({
			cwd: fixture.featureWorktree,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(current.items[0]?.state, "current");
		assert.equal(current.items[0]?.candidate, false);
	} finally {
		fixture.cleanup();
	}
});

test("classifies an upstream-gone worktree only while it remains clean", async () => {
	const fixture = createGitFixture();
	try {
		git(fixture.repository, "update-ref", "-d", "refs/remotes/origin/feature");
		const report = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(report.items[0]?.state, "upstream-gone");
		assert.equal(report.items[0]?.candidate, true);
	} finally {
		fixture.cleanup();
	}
});

test("protects locked worktrees even when their branch is merged", async () => {
	const fixture = createGitFixture();
	try {
		git(fixture.repository, "worktree", "lock", "--reason", "active session", fixture.featureWorktree);
		const report = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(report.items[0]?.state, "unknown");
		assert.equal(report.items[0]?.candidate, false);
		assert.match(report.items[0]?.detail ?? "", /locked/);
	} finally {
		fixture.cleanup();
	}
});

test("reports a Git-prunable registration as a cleanup candidate", async () => {
	const fixture = createGitFixture();
	try {
		rmSync(fixture.featureWorktree, { recursive: true, force: true });
		const report = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(report.items[0]?.state, "prunable");
		assert.equal(report.items[0]?.candidate, true);
	} finally {
		fixture.cleanup();
	}
});

test("classifies a registered worktree with a broken gitdir pointer as dangling", async () => {
	const fixture = createGitFixture();
	try {
		const gitFile = join(fixture.featureWorktree, ".git");
		const metadata = git(fixture.featureWorktree, "rev-parse", "--absolute-git-dir");
		rmSync(metadata, { recursive: true, force: true });
		assert.match(gitFile, /\.git$/);

		const report = await scanWorktreeHealth({
			cwd: fixture.repository,
			runner,
			worktreeRoot: fixture.worktreeRoot,
		});
		assert.equal(report.items[0]?.state, "dangling");
		assert.equal(report.items[0]?.candidate, true);
	} finally {
		fixture.cleanup();
	}
});

test("finds broken gitdir pointers without treating valid worktrees as dangling", () => {
	const root = mkdtempSync(join(tmpdir(), "worktree-pointers-"));
	try {
		const valid = join(root, "valid");
		const dangling = join(root, "group", "dangling");
		const target = join(root, "metadata");
		mkdirSync(valid);
		mkdirSync(dangling, { recursive: true });
		mkdirSync(target);
		writeFileSync(join(valid, ".git"), `gitdir: ${target}\n`);
		writeFileSync(join(dangling, ".git"), `gitdir: ${join(root, "missing")}\n`);

		assert.deepEqual(findDanglingWorktreeDirectories(root).map((item) => item.path), [dangling]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("warns at startup and exposes a detailed read-only command", async () => {
	const report: WorktreeHealthReport = {
		workspaceDirectory: "/workspace",
		worktreeRoot: "/workspace/tmp/worktrees",
		repositoryRoot: "/workspace/repo/project",
		baseRef: "origin/main",
		items: [{
			path: "/workspace/tmp/worktrees/feature",
			state: "merged",
			candidate: true,
			branch: "feature",
			detail: "clean tracked branch is contained in local origin/main",
		}],
		warnings: [],
	};
	let sessionStart: ((event: { reason: string }, ctx: never) => Promise<void>) | undefined;
	let command: { handler: (args: string, ctx: never) => Promise<void> } | undefined;
	const notifications: Array<{ message: string; level: string }> = [];
	const ctx = {
		hasUI: true,
		ui: {
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
		},
	} as never;

	createWorktreeHealthExtension({ inspect: async () => report })({
		on(event: string, handler: typeof sessionStart) {
			if (event === "session_start") sessionStart = handler;
		},
		registerCommand(name: string, definition: typeof command) {
			if (name === "worktree-health") command = definition;
		},
	} as never);

	assert.ok(sessionStart);
	assert.ok(command);
	await sessionStart({ reason: "startup" }, ctx);
	await new Promise((resolve) => setImmediate(resolve));
	await command.handler("", ctx);
	assert.match(notifications[0]?.message ?? "", /1 cleanup candidate/);
	assert.equal(notifications[0]?.level, "warning");
	assert.match(notifications[1]?.message ?? "", /\[merged\]/);
});
