import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = join(repositoryRoot, "scripts/pi-session-metrics");
const python = process.env.PYTHON ?? "python3";
const extractorScript = "extract_local_metrics.py";
const plotScripts = [
	"plot_context_epoch_structure.py",
	"plot_daily_aggregate.py",
	"plot_token_distributions.py",
];

test("Pi session metric CLIs expose help without plotting dependencies", () => {
	for (const script of [extractorScript, ...plotScripts]) {
		const result = spawnSync(python, [join(scriptsDirectory, script), "--help"], {
			encoding: "utf8",
		});
		assert.equal(result.status, 0, `${script}: ${result.stderr}`);
		assert.match(result.stdout, /usage:/);
	}
});

test("Pi session metric CSV helpers validate schemas and derive non-cache tokens", () => {
	const directory = mkdtempSync(join(tmpdir(), "jihye-session-metrics-"));
	try {
		const csvPath = join(directory, "usage.csv");
		writeFileSync(csvPath, "date,total_tokens,cacheRead\n2026-08-03,100,75\n");
		const program = [
			"from pathlib import Path",
			"from _common import load_csv, non_cache_tokens",
			`rows = load_csv(Path(${JSON.stringify(csvPath)}), {'date', 'total_tokens', 'cacheRead'})`,
			"assert non_cache_tokens(rows[0]) == 25",
		].join("; ");
		const result = spawnSync(python, ["-c", program], {
			encoding: "utf8",
			env: {
				...process.env,
				PYTHONPATH: scriptsDirectory,
			},
		});
		assert.equal(result.status, 0, result.stderr);

		const invalidProgram = [
			"from pathlib import Path",
			"from _common import load_csv",
			`load_csv(Path(${JSON.stringify(csvPath)}), {'missing'})`,
		].join("; ");
		const invalidResult = spawnSync(python, ["-c", invalidProgram], {
			encoding: "utf8",
			env: {
				...process.env,
				PYTHONPATH: scriptsDirectory,
			},
		});
		assert.notEqual(invalidResult.status, 0);
		assert.match(invalidResult.stderr, /missing required columns: missing/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("daily session groups allow days without a newly-started session", () => {
	const program = [
		"from plot_daily_aggregate import group_sessions_by_first_turn_date",
		"rows = [{'session_id': 's1', 'date': '2026-08-03', 'persisted_user_turns': '1', 'compactions': '0'}, {'session_id': 's1', 'date': '2026-08-04', 'persisted_user_turns': '2', 'compactions': '1'}]",
		"groups, sessions = group_sessions_by_first_turn_date(rows, ['2026-08-03', '2026-08-04'])",
		"assert len(groups['2026-08-03']) == 1",
		"assert groups['2026-08-04'] == []",
		"assert sessions[0]['turns'] == 3 and sessions[0]['compactions'] == 1",
	].join("; ");
	const result = spawnSync(python, ["-c", program], {
		encoding: "utf8",
		env: {
			...process.env,
			PYTHONPATH: scriptsDirectory,
		},
	});
	assert.equal(result.status, 0, result.stderr);
});

test("local session extraction follows the active branch and emits content-free scoped CSVs", () => {
	const directory = mkdtempSync(join(tmpdir(), "jihye-session-extractor-"));
	try {
		const sessionsDirectory = join(directory, "sessions");
		const outputDirectory = join(directory, "csv");
		mkdirSync(sessionsDirectory);
		const sessionPath = join(sessionsDirectory, "session.jsonl");
		const excludedPath = join(sessionsDirectory, "excluded.jsonl");
		const records = [
			{ type: "session", id: "session-1", timestamp: "2026-07-31T23:00:00Z" },
			{ type: "message", id: "user-1", parentId: null, timestamp: "2026-08-01T12:00:00Z", message: { role: "user", content: "PRIVATE_USER_TEXT" } },
			{ type: "message", id: "unused-branch", parentId: "user-1", timestamp: "2026-08-01T12:01:00Z", message: { role: "assistant", content: [], usage: { totalTokens: 999, cacheRead: 900 } } },
			{ type: "message", id: "assistant-1", parentId: "user-1", timestamp: "2026-08-01T12:02:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "subagent", arguments: { task: "PRIVATE_TASK_TEXT" } }], usage: { totalTokens: 100, cacheRead: 80 } } },
			{ type: "message", id: "result-1", parentId: "assistant-1", timestamp: "2026-08-01T12:03:00Z", message: { role: "toolResult", toolName: "subagent", toolCallId: "call-1", content: "PRIVATE_RESULT_TEXT", details: { results: [{ usage: { totalTokens: 50, cacheRead: 40 }, progress: { recentTools: [{ children: [{ usage: { totalTokens: 25, cacheRead: 20 } }] }] } }] } } },
			{ type: "compaction", id: "compaction-1", parentId: "result-1", timestamp: "2026-08-02T12:00:00Z" },
			{ type: "message", id: "user-2", parentId: "compaction-1", timestamp: "2026-08-02T12:01:00Z", message: { role: "user", content: "PRIVATE_SECOND_USER_TEXT" } },
			{ type: "message", id: "assistant-2", parentId: "user-2", timestamp: "2026-08-02T12:02:00Z", message: { role: "assistant", content: [], usage: { input: 5, output: 2, cacheRead: 20, cacheWrite: 3 } } },
		];
		writeFileSync(sessionPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
		writeFileSync(excludedPath, `${JSON.stringify({ type: "session", id: "excluded", timestamp: "2026-08-02T00:00:00Z" })}\n`);

		const result = spawnSync(python, [
			join(scriptsDirectory, extractorScript),
			"--sessions-dir", sessionsDirectory,
			"--output-dir", outputDirectory,
			"--timezone", "UTC",
			"--start-date", "2026-08-01",
			"--end-date", "2026-08-03",
			"--exclude-current-session",
		], {
			encoding: "utf8",
			env: { ...process.env, PI_SESSION_FILE: excludedPath },
		});
		assert.equal(result.status, 0, result.stderr);
		const summary = JSON.parse(result.stdout);
		assert.deepEqual(
			{
				sessionsRead: summary.sessions_read,
				sessionsExcluded: summary.sessions_excluded,
				branchedSessions: summary.branched_sessions,
				startDate: summary.start_date,
				endDate: summary.end_date_exclusive,
			},
			{
				sessionsRead: 1,
				sessionsExcluded: 1,
				branchedSessions: 1,
				startDate: "2026-08-01",
				endDate: "2026-08-03",
			},
		);

		assert.equal(
			readFileSync(join(outputDirectory, "main_agent_turn_usage.csv"), "utf8"),
			"date,total_tokens,cacheRead,used_subagents\n2026-08-01,100,80,1\n2026-08-02,30,20,0\n",
		);
		assert.equal(
			readFileSync(join(outputDirectory, "subagent_run_usage.csv"), "utf8"),
			"date,total_tokens,cacheRead\n2026-08-01,50,40\n2026-08-01,25,20\n",
		);
		assert.equal(
			readFileSync(join(outputDirectory, "session_daily_structure.csv"), "utf8"),
			"session_id,date,persisted_user_turns,compactions\nsession-1,2026-08-01,1,0\nsession-1,2026-08-02,1,1\n",
		);
		assert.equal(
			readFileSync(join(outputDirectory, "context_epoch_usage.csv"), "utf8"),
			"start_date,epoch_type,persisted_user_messages_introduced,main_provider_events\n2026-08-02,post_compaction,1,1\n",
		);
		const allCsv = [
			"main_agent_turn_usage.csv",
			"subagent_run_usage.csv",
			"session_daily_structure.csv",
			"context_epoch_usage.csv",
		].map((name) => readFileSync(join(outputDirectory, name), "utf8")).join("\n");
		assert.doesNotMatch(allCsv, /PRIVATE_/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("Pi session metric plotters consume derived CSVs rather than raw sessions", () => {
	for (const script of plotScripts) {
		const source = readFileSync(join(scriptsDirectory, script), "utf8");
		assert.doesNotMatch(source, /\/Users\//);
		assert.doesNotMatch(source, /\.pi\/agent\/sessions/);
		assert.doesNotMatch(source, /glob\.glob/);
	}
});
