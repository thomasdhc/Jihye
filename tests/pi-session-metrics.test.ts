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
	"plot_context_epoch_messages_by_date.py",
	"plot_context_epoch_structure.py",
	"plot_daily_aggregate.py",
	"plot_delegation_economics.py",
	"plot_runtime_comparison.py",
	"plot_token_distributions.py",
	"plot_tool_rates_over_time.py",
	"plot_tool_reliability.py",
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

test("per-date context epoch plots retain active zero-message rows and clean stale dates", () => {
	const program = [
		"import shutil, tempfile",
		"from pathlib import Path",
		"from plot_context_epoch_messages_by_date import group_active_epochs_by_date, log_ticks, remove_stale_date_outputs",
		"rows = [{'start_date': '2026-08-03', 'epoch_type': 'initial', 'persisted_user_messages_introduced': '2', 'main_provider_events': '5'}, {'start_date': '2026-08-03', 'epoch_type': 'post_compaction', 'persisted_user_messages_introduced': '0', 'main_provider_events': '3'}, {'start_date': '2026-08-04', 'epoch_type': 'initial', 'persisted_user_messages_introduced': '1', 'main_provider_events': '0'}]",
		"groups, omitted = group_active_epochs_by_date(rows)",
		"assert list(groups) == ['2026-08-03'] and len(groups['2026-08-03']) == 2 and omitted == 1",
		"assert 2_000 in log_ticks(2_500)",
		"directory = Path(tempfile.mkdtemp())",
		"(directory / '2026-08-02.png').touch()",
		"(directory / 'notes.png').touch()",
		"remove_stale_date_outputs(directory, {'2026-08-03'})",
		"assert not (directory / '2026-08-02.png').exists() and (directory / 'notes.png').exists()",
		"shutil.rmtree(directory)",
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
			{ type: "custom", customType: "jihye-runtime", id: "runtime-1", parentId: "user-1", timestamp: "2026-08-01T12:01:00Z", data: { jihyeVersion: "0.2.1", profile: "standard", piVersion: "0.83.0" } },
			{ type: "message", id: "unused-branch", parentId: "runtime-1", timestamp: "2026-08-01T12:01:30Z", message: { role: "assistant", content: [], usage: { totalTokens: 999, cacheRead: 900 } } },
			{ type: "message", id: "assistant-1", parentId: "runtime-1", timestamp: "2026-08-01T12:02:00Z", message: { role: "assistant", model: "claude-opus-5", content: [{ type: "toolCall", id: "call-1", name: "subagent", arguments: { task: "PRIVATE_TASK_TEXT" } }, { type: "toolCall", id: "call-2", name: "read", arguments: { path: "/PRIVATE_PATH" } }, { type: "toolCall", id: "call-3", name: "bash", arguments: { command: "PRIVATE_COMMAND" } }], usage: { totalTokens: 100, cacheRead: 80, cacheWrite: 5, output: 10, cost: { total: 0.5 } } } },
			{ type: "message", id: "result-1", parentId: "assistant-1", timestamp: "2026-08-01T12:03:00Z", message: { role: "toolResult", toolName: "subagent", toolCallId: "call-1", content: "PRIVATE_RESULT_TEXT", details: { results: [{ agent: "scout", usage: { totalTokens: 50, cacheRead: 40 }, progress: { status: "completed", durationMs: 1500, toolCount: 4, recentTools: [{ children: [{ usage: { totalTokens: 25, cacheRead: 20 }, progress: { status: "failed", durationMs: 250 } }] }] } }] } } },
			{ type: "message", id: "result-2", parentId: "result-1", timestamp: "2026-08-01T12:04:00Z", message: { role: "toolResult", toolName: "read", toolCallId: "call-2", isError: true, content: "PRIVATE_ERROR_TEXT" } },
			{ type: "message", id: "result-3", parentId: "result-2", timestamp: "2026-08-01T12:05:00Z", message: { role: "toolResult", toolName: "bash", toolCallId: "call-3", content: "PRIVATE_OUTPUT_TEXT\n[output truncated]" } },
			{ type: "compaction", id: "compaction-1", parentId: "result-3", timestamp: "2026-08-02T12:00:00Z" },
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

		assert.deepEqual(summary.data_quality, {
			tool_calls_without_result: 0,
			tool_results_without_call: 0,
		});
		assert.equal(
			readFileSync(join(outputDirectory, "main_agent_turn_usage.csv"), "utf8"),
			"date,total_tokens,cacheRead,cache_write,output_tokens,cost,model,subagent_calls,jihye_version,persona_profile,pi_version\n"
			+ "2026-08-01,100,80,5,10,0.5,claude-opus-5,1,0.2.1,standard,0.83.0\n"
			+ "2026-08-02,30,20,3,2,0,,0,0.2.1,standard,0.83.0\n",
		);
		// Nested subagent results keep their own depth, agent fallback, and failure state.
		assert.equal(
			readFileSync(join(outputDirectory, "subagent_run_usage.csv"), "utf8"),
			"date,agent,depth,total_tokens,cacheRead,cache_write,output_tokens,cost,failed,duration_ms,tool_calls,jihye_version,persona_profile,pi_version\n"
			+ "2026-08-01,scout,1,50,40,0,0,0,0,1500,4,0.2.1,standard,0.83.0\n"
			+ "2026-08-01,unknown,2,25,20,0,0,0,1,250,0,0.2.1,standard,0.83.0\n",
		);
		// `read` fails through isError; `bash` is truncated through the content marker only.
		assert.equal(
			readFileSync(join(outputDirectory, "tool_usage.csv"), "utf8"),
			"date,tool,calls,results,errors,truncated,jihye_version,persona_profile,pi_version\n"
			+ "2026-08-01,bash,1,1,0,1,0.2.1,standard,0.83.0\n"
			+ "2026-08-01,read,1,1,1,0,0.2.1,standard,0.83.0\n"
			+ "2026-08-01,subagent,1,1,0,0,0.2.1,standard,0.83.0\n",
		);
		// The first user turn precedes the runtime marker, so that session-day stays unattributed.
		assert.equal(
			readFileSync(join(outputDirectory, "session_daily_structure.csv"), "utf8"),
			"session_id,date,persisted_user_turns,compactions,jihye_version,persona_profile,pi_version\n"
			+ "session-1,2026-08-01,1,0,,,\n"
			+ "session-1,2026-08-02,1,1,0.2.1,standard,0.83.0\n",
		);
		assert.equal(
			readFileSync(join(outputDirectory, "context_epoch_usage.csv"), "utf8"),
			"start_date,epoch_type,persisted_user_messages_introduced,main_provider_events,jihye_version,persona_profile,pi_version\n"
			+ "2026-08-02,post_compaction,1,1,0.2.1,standard,0.83.0\n",
		);
		const allCsv = [
			"main_agent_turn_usage.csv",
			"subagent_run_usage.csv",
			"tool_usage.csv",
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
