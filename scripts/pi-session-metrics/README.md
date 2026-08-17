# Pi session metrics

These scripts form an end-to-end, local pipeline for deriving content-free metrics from Pi sessions and rendering reusable usage graphs:

1. `extract_local_metrics.py` scans local Pi JSONL sessions and writes five derived CSVs.
2. The `plot_*.py` scripts consume only those CSVs and write aggregate graphs plus one context-epoch PNG per active date.

The extractor necessarily reads local session records, but it does not write prompts, message text, tool arguments, tasks, or tool outputs. The derived data contains dates, token counts, costs, compaction counts, delegation counts, epoch types, session IDs, and metadata names for tools, agent roles, models, and runtimes. The plotters never open Pi JSONL files.

Deciding whether a tool result was truncated requires reading that result's text, so the extractor inspects it transiently and emits only a boolean count. No inspected text reaches a CSV.

Generated CSVs and graphs belong under `tmp/` or another untracked output directory; they are intentionally not committed to Jihye.

## Requirements

- Python 3.11 or newer
- An operating system timezone database available through Python's `zoneinfo`
- [`matplotlib`](https://matplotlib.org/) and [`numpy`](https://numpy.org/) for plotting

From the Jihye repository root, install plotting dependencies in an isolated environment:

```bash
python -m pip install -r scripts/pi-session-metrics/requirements.txt
```

The extractor itself uses only the Python standard library.

## End-to-end example: August 1 through yesterday

The following Bash commands use `America/New_York`, include August 1, and exclude today. `--end-date` is always exclusive.

### 1. Define the scope and output locations

```bash
TIMEZONE=America/New_York
START_DATE=2026-08-01
END_DATE=$(TZ="$TIMEZONE" date +%F)
METRICS="$PWD/tmp/pi-session-metrics"
CSV="$METRICS/csv"
GRAPHS="$METRICS/graphs"
```

When the command runs on August 14 in the selected timezone, this scope is August 1 through August 13.

### 2. Exclude the current Pi session when applicable

Pi JSONL does not contain a durable "completed" marker. Do not read a session while Pi is still appending to it. When running the command through a Pi session, `PI_SESSION_FILE` identifies that current session:

```bash
EXCLUDE_ARGS=()
if [[ -n "${PI_SESSION_FILE:-}" ]]; then
  EXCLUDE_ARGS+=(--exclude-current-session)
fi
```

Close other active Pi sessions before extraction, or exclude each known active file with another `--exclude /path/to/session.jsonl`. `--exclude-current-session` only covers the file named by `PI_SESSION_FILE`; it cannot discover unrelated Pi processes.

### 3. Extract the derived CSVs

```bash
python scripts/pi-session-metrics/extract_local_metrics.py \
  --sessions-dir "$HOME/.pi/agent/sessions" \
  --output-dir "$CSV" \
  --timezone "$TIMEZONE" \
  --start-date "$START_DATE" \
  --end-date "$END_DATE" \
  "${EXCLUDE_ARGS[@]}"
```

The extractor recursively scans `*.jsonl`, follows each session's active branch, and reports its scope and row counts as JSON. It overwrites these files in `$CSV`:

- `context_epoch_usage.csv`
- `main_agent_turn_usage.csv`
- `subagent_run_usage.csv`
- `session_daily_structure.csv`
- `tool_usage.csv`

Omit `--start-date` or `--end-date` for an open-ended scope. Repeat `--exclude` as needed. Run `python scripts/pi-session-metrics/extract_local_metrics.py --help` for all options.

### 4. Generate every graph

```bash
mkdir -p "$GRAPHS"

python scripts/pi-session-metrics/plot_context_epoch_structure.py \
  --epochs-csv "$CSV/context_epoch_usage.csv" \
  --png "$GRAPHS/context_epoch_structure.png" \
  --svg "$GRAPHS/context_epoch_structure.svg" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_context_epoch_messages_by_date.py \
  --epochs-csv "$CSV/context_epoch_usage.csv" \
  --output-dir "$GRAPHS/context_epoch_messages_by_date" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_daily_aggregate.py \
  --main-turns-csv "$CSV/main_agent_turn_usage.csv" \
  --subagent-runs-csv "$CSV/subagent_run_usage.csv" \
  --session-daily-csv "$CSV/session_daily_structure.csv" \
  --png "$GRAPHS/daily_aggregate_tokens_and_turns.png" \
  --svg "$GRAPHS/daily_aggregate_tokens_and_turns.svg" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_token_distributions.py \
  --main-turns-csv "$CSV/main_agent_turn_usage.csv" \
  --subagent-runs-csv "$CSV/subagent_run_usage.csv" \
  --output-dir "$GRAPHS" \
  --svg

python scripts/pi-session-metrics/plot_tool_reliability.py \
  --tool-usage-csv "$CSV/tool_usage.csv" \
  --png "$GRAPHS/tool_reliability.png" \
  --svg "$GRAPHS/tool_reliability.svg" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_tool_rates_over_time.py \
  --tool-usage-csv "$CSV/tool_usage.csv" \
  --png "$GRAPHS/tool_rates_over_time.png" \
  --svg "$GRAPHS/tool_rates_over_time.svg" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_delegation_economics.py \
  --subagent-runs-csv "$CSV/subagent_run_usage.csv" \
  --main-turns-csv "$CSV/main_agent_turn_usage.csv" \
  --png "$GRAPHS/delegation_economics.png" \
  --svg "$GRAPHS/delegation_economics.svg" \
  --timezone-label "$TIMEZONE"

python scripts/pi-session-metrics/plot_runtime_comparison.py \
  --main-turns-csv "$CSV/main_agent_turn_usage.csv" \
  --tool-usage-csv "$CSV/tool_usage.csv" \
  --session-daily-csv "$CSV/session_daily_structure.csv" \
  --png "$GRAPHS/runtime_comparison.png" \
  --svg "$GRAPHS/runtime_comparison.svg" \
  --timezone-label "$TIMEZONE"
```

This produces eight aggregate graphs in both PNG and SVG form:

- `context_epoch_structure`
- `daily_aggregate_tokens_and_turns`
- `main_and_subagent_separate_distribution`
- `main_and_subagent_non_cache_distribution`
- `tool_reliability`
- `tool_rates_over_time`
- `delegation_economics`
- `runtime_comparison`

It also writes one larger PNG per active context-epoch start date under `context_epoch_messages_by_date/`. ISO date filenames make missing dates and date scope explicit; reruns remove stale ISO-date PNGs from that dedicated directory while preserving unrelated files.

Rerun extraction before plotting whenever the date scope, timezone, exclusions, or source sessions change.

## Extraction semantics

- **Date bounds:** `--start-date` is inclusive and `--end-date` is exclusive. Dates are derived in `--timezone`.
- **Branches:** only the active branch ending at the latest session entry contributes metrics. The JSON summary reports how many source sessions contain branches.
- **Main-agent usage:** each positive-token assistant provider event is attributed to its local calendar date.
- **Subagent usage:** top-level and recursively nested subagent results are attributed to the parent subagent invocation date. Zero-token results are retained.
- **Session structure:** persisted user turns and compactions are counted by their event date.
- **Context epochs:** date bounds select whole epochs by `start_date`; an included epoch retains its complete active-branch counts even if it later crosses the exclusive end date. An epoch that began before the start date is not included.
- **Tool outcomes:** every tool call and every tool result is counted, not only `subagent`. A result is attributed to the date of its originating call when that call is on the branch, otherwise to its own date. A result counts as errored when Pi marks `isError`, and as truncated when its details say so or its text carries a truncation marker.
- **Runtime attribution:** `jihye-setup` writes an invisible `jihye-runtime` marker entry whenever the Jihye version, persona profile, or Pi version changes. Walking the branch in order, each row inherits the runtime current at the row's first counted entry, and rows before the first marker stay unattributed as empty strings. A session-day whose first user turn precedes the marker is therefore unattributed even when later rows that day are attributed.
- **Cost:** Pi records assistant cost as an object and subagent cost as a scalar. The extractor reads `cost.total` from the object form and the scalar directly, so `cost` is comparable across both.
- **Read count:** `sessions_read` counts every valid, non-excluded session scanned, including sessions with no rows in the selected date range.
- **Data quality:** the JSON summary reports `tool_calls_without_result` and `tool_results_without_call`. These usually reflect interrupted sessions and branch navigation, so they stay diagnostics and never become CSV columns or plotted series.

## CSV schemas

The generated CSVs are the source of truth for plotting.

### Context epochs

`context_epoch_usage.csv` contains:

- `start_date`
- `epoch_type` (`initial` or `post_compaction`)
- `persisted_user_messages_introduced`
- `main_provider_events`
- `jihye_version`, `persona_profile`, `pi_version`

`plot_context_epoch_structure.py` omits rows with no regular main-provider event from the graph while leaving the source CSV unchanged. `--max-user-messages N` optionally removes whole epochs above a threshold from both panels.

`plot_context_epoch_messages_by_date.py` writes one message-versus-decision-round PNG per active ISO `start_date`. It omits epochs without a regular main-provider event, retains active zero-message epochs in a dedicated zero column, separates initial and post-compaction epochs by color and shape, applies small deterministic jitter to exact overlaps, and labels repeated exact coordinates with `×N`.

### Main-agent turns

`main_agent_turn_usage.csv` contains:

- `date`
- `total_tokens`
- `cacheRead`
- `cache_write`
- `output_tokens`
- `cost`
- `model`
- `subagent_calls`
- `jihye_version`, `persona_profile`, `pi_version`

`subagent_calls` is the number of subagent calls declared by that assistant event. Plotters treat any positive value as delegated.

### Subagent runs

`subagent_run_usage.csv` contains one row per delegated run, including recursively nested runs:

- `date`
- `agent` (role name, `unknown` when the result declares none)
- `depth` (`1` for a top-level run, incrementing for nested runs)
- `total_tokens`
- `cacheRead`
- `cache_write`
- `output_tokens`
- `cost`
- `failed` (`1` when the run reports a nonzero exit code, failed status, or an error string)
- `duration_ms`
- `tool_calls`
- `jihye_version`, `persona_profile`, `pi_version`

### Tool usage

`tool_usage.csv` contains one row per `(date, tool, runtime)` group:

- `date`
- `tool`
- `calls`
- `results`
- `errors`
- `truncated`
- `jihye_version`, `persona_profile`, `pi_version`

### Daily session structure

`session_daily_structure.csv` contains:

- `session_id`
- `date`
- `persisted_user_turns`
- `compactions`
- `jihye_version`, `persona_profile`, `pi_version`

The daily plot groups each session by its first user-turn date in the supplied CSV scope.

## Plot interpretation

The daily aggregate's first two token panels show cache-inclusive and non-cache usage. Non-cache tokens are `total_tokens - cacheRead`, equivalent to input + output + cache write under the Pi usage schema.

The per-date context-epoch plots separate crowded dates into dedicated PNGs while retaining consistent logarithmic scaling and ratio guides across files. The distribution plotters exclude nonpositive observations separately for each metric. Passing `--svg` writes vector versions alongside the distribution PNG files.

`tool_reliability` shows call volume beside outcome composition, so a high-volume tool with a modest error share is not confused with a low-volume tool that fails often. A result can be both errored and truncated; the error segment absorbs that overlap, making the truncation segment a lower bound.

`tool_rates_over_time` plots failures per 100 calls rather than raw failure counts, because counts track how busy a day was instead of how reliable it was. Dates below `--min-calls` are drawn as hollow markers and excluded from headline averages. When the range spans more than one `jihye_version`, the plot delimits those date ranges so a reliability shift can be read against a guidance change.

`delegation_economics` answers whether each delegated role pays for itself, pairing per-role totals, run counts, failure rates, and durations with a per-run distribution panel that reveals whether a role is a steady cost or an occasional spike. The main-agent baseline is a scale reference, not a like-for-like comparison.

`runtime_comparison` groups the corpus by `jihye_version`, `persona_profile`, or `pi_version` and reports sample sizes on every panel. It renders an explicit caveat on the figure: these groups are not randomised and their task mix varies, so differences are suggestive and never causal. The graph only becomes informative once the corpus spans several runtimes; before that, nearly every row is unattributed and the comparison is degenerate.

Use each plotting script's `--help` output for its optional display and filtering controls.
