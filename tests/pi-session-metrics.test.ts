import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = join(repositoryRoot, "scripts/pi-session-metrics");
const python = process.env.PYTHON ?? "python3";
const plotScripts = [
	"plot_context_epoch_structure.py",
	"plot_daily_aggregate.py",
	"plot_token_distributions.py",
];

test("Pi session metric plot CLIs expose help without plotting dependencies", () => {
	for (const script of plotScripts) {
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

test("Pi session metric plotters consume derived CSVs rather than raw sessions", () => {
	for (const script of plotScripts) {
		const source = readFileSync(join(scriptsDirectory, script), "utf8");
		assert.doesNotMatch(source, /\/Users\//);
		assert.doesNotMatch(source, /\.pi\/agent\/sessions/);
		assert.doesNotMatch(source, /glob\.glob/);
	}
});
