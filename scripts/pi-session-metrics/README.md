# Pi session metrics

These scripts form an end-to-end, local pipeline for deriving content-free metrics from Pi sessions and rendering reusable usage graphs:

1. `extract_local_metrics.py` scans local Pi JSONL sessions and writes four derived CSVs.
2. The four `plot_*.py` scripts consume only those CSVs and write aggregate graphs plus one context-epoch PNG per active date.

The extractor necessarily reads local session records, but it does not write prompts, message text, tool arguments, tasks, or tool outputs. The derived data contains dates, token counts, compaction counts, delegation flags, epoch types, and session IDs. The plotters never open Pi JSONL files.

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
```

This produces four aggregate graphs in both PNG and SVG form:

- `context_epoch_structure`
- `daily_aggregate_tokens_and_turns`
- `main_and_subagent_separate_distribution`
- `main_and_subagent_non_cache_distribution`

It also writes one larger PNG per active context-epoch start date under `context_epoch_messages_by_date/`. ISO date filenames make missing dates and date scope explicit; reruns remove stale ISO-date PNGs from that dedicated directory while preserving unrelated files.

Rerun extraction before plotting whenever the date scope, timezone, exclusions, or source sessions change.

## Extraction semantics

- **Date bounds:** `--start-date` is inclusive and `--end-date` is exclusive. Dates are derived in `--timezone`.
- **Branches:** only the active branch ending at the latest session entry contributes metrics. The JSON summary reports how many source sessions contain branches.
- **Main-agent usage:** each positive-token assistant provider event is attributed to its local calendar date.
- **Subagent usage:** top-level and recursively nested subagent results are attributed to the parent subagent invocation date. Zero-token results are retained.
- **Session structure:** persisted user turns and compactions are counted by their event date.
- **Context epochs:** date bounds select whole epochs by `start_date`; an included epoch retains its complete active-branch counts even if it later crosses the exclusive end date. An epoch that began before the start date is not included.
- **Read count:** `sessions_read` counts every valid, non-excluded session scanned, including sessions with no rows in the selected date range.

## CSV schemas

The generated CSVs are the source of truth for plotting.

### Context epochs

`context_epoch_usage.csv` contains:

- `start_date`
- `epoch_type` (`initial` or `post_compaction`)
- `persisted_user_messages_introduced`
- `main_provider_events`

`plot_context_epoch_structure.py` omits rows with no regular main-provider event from the graph while leaving the source CSV unchanged. `--max-user-messages N` optionally removes whole epochs above a threshold from both panels.

`plot_context_epoch_messages_by_date.py` writes one message-versus-decision-round PNG per active ISO `start_date`. It omits epochs without a regular main-provider event, retains active zero-message epochs in a dedicated zero column, separates initial and post-compaction epochs by color and shape, applies small deterministic jitter to exact overlaps, and labels repeated exact coordinates with `×N`.

### Main-agent turns

`main_agent_turn_usage.csv` contains:

- `date`
- `total_tokens`
- `cacheRead`
- `used_subagents`

`used_subagents` is the number of subagent calls declared by that assistant event. Plotters treat any positive value as delegated.

### Subagent runs

`subagent_run_usage.csv` contains:

- `date`
- `total_tokens`
- `cacheRead`

### Daily session structure

`session_daily_structure.csv` contains:

- `session_id`
- `date`
- `persisted_user_turns`
- `compactions`

The daily plot groups each session by its first user-turn date in the supplied CSV scope.

## Plot interpretation

The daily aggregate's first two token panels show cache-inclusive and non-cache usage. Non-cache tokens are `total_tokens - cacheRead`, equivalent to input + output + cache write under the Pi usage schema.

The per-date context-epoch plots separate crowded dates into dedicated PNGs while retaining consistent logarithmic scaling and ratio guides across files. The distribution plotters exclude nonpositive observations separately for each metric. Passing `--svg` writes vector versions alongside the distribution PNG files.

Use each plotting script's `--help` output for its optional display and filtering controls.
