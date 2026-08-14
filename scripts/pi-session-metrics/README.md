# Pi session metric plots

These scripts regenerate the reusable, content-free visualizations developed during the Pi session-usage analysis. They read derived CSV metrics only; they do not discover Pi sessions, open JSONL session files, or read message text.

## Requirements

- Python 3.11 or newer
- [`matplotlib`](https://matplotlib.org/)
- [`numpy`](https://numpy.org/)

Install the plotting dependencies in an isolated environment:

```bash
python -m pip install -r scripts/pi-session-metrics/requirements.txt
```

## Inputs

The scripts treat the supplied CSVs as the source-of-truth analysis scope. Date filtering, exclusion of an in-progress session, and attribution of descendant usage must happen when those CSVs are produced.

### Context epochs

`plot_context_epoch_structure.py` requires:

- `start_date`
- `epoch_type` (`initial` or `post_compaction`)
- `persisted_user_messages_introduced`
- `main_provider_events`

Rows with no regular main-provider event are retained in the source CSV but omitted from the graph. `--max-user-messages N` optionally removes whole epochs above a threshold from both panels.

### Daily aggregate

`plot_daily_aggregate.py` requires three CSVs:

- Main turns: `date`, `total_tokens`, `cacheRead`, `used_subagents`
- Subagent runs: `date`, `total_tokens`, `cacheRead`
- Daily session structure: `session_id`, `date`, `persisted_user_turns`, `compactions`

The first two token panels show cache-inclusive and non-cache usage. Non-cache tokens are `total_tokens - cacheRead`, equivalent to input + output + cache write under the Pi usage schema. Sessions are grouped by their first user-turn date in the supplied scope.

### Token distributions

`plot_token_distributions.py` uses the same main-turn and subagent-run columns as the daily aggregate. It excludes nonpositive observations separately for each metric and writes:

- `main_and_subagent_separate_distribution.png`
- `main_and_subagent_non_cache_distribution.png`

Passing `--svg` also writes matching vector files.

## Examples

From the Jihye repository root, with a metrics package containing a `csv/` directory:

```bash
METRICS=/path/to/pi-session-metrics
OUTPUT=/path/to/output

python scripts/pi-session-metrics/plot_context_epoch_structure.py \
  --epochs-csv "$METRICS/csv/context_epoch_usage.csv" \
  --png "$OUTPUT/context_epoch_structure.png" \
  --svg "$OUTPUT/context_epoch_structure.svg"

python scripts/pi-session-metrics/plot_daily_aggregate.py \
  --main-turns-csv "$METRICS/csv/main_agent_turn_usage.csv" \
  --subagent-runs-csv "$METRICS/csv/subagent_run_usage.csv" \
  --session-daily-csv "$METRICS/csv/session_daily_structure.csv" \
  --png "$OUTPUT/daily_aggregate_tokens_and_turns.png" \
  --svg "$OUTPUT/daily_aggregate_tokens_and_turns.svg"

python scripts/pi-session-metrics/plot_token_distributions.py \
  --main-turns-csv "$METRICS/csv/main_agent_turn_usage.csv" \
  --subagent-runs-csv "$METRICS/csv/subagent_run_usage.csv" \
  --output-dir "$OUTPUT" \
  --svg
```

Use each script's `--help` output for all options. Generated data and graphs are intentionally not tracked in Jihye.
