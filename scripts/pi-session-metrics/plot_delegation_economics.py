#!/usr/bin/env python3
"""Plot whether each delegated agent role pays for the tokens it consumes.

Encoding: the suggested scatter (tokens against runs, failure rate as color,
duration as marker area) was drawn first and rejected. Four to eight roles
cluster inside a single order of magnitude on both axes, so the role labels
collide, the marker areas stop being comparable, and one cheap degenerate role
stretches the logarithmic range until every other role is a dot. This plot
instead keeps one row per role and gives each variable its own honest axis:
total non-cache tokens, runs, failure rate, and median duration, all aligned on
the same role row and colored consistently, so a role can be read straight
across.

The final panel adds the per-run token distribution, because totals alone
cannot tell a role that costs a steady amount every run from one that is
usually cheap and occasionally explodes; those two shapes call for different
responses.

Nested runs are included by default: a run at depth 2 is still tokens spent, so
every depth contributes unless `--max-depth` restricts it. Each role label
states the depths its runs came from.
"""

from __future__ import annotations

import argparse
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

from _common import date_label, ensure_parent, integer, load_csv, non_cache_tokens

RUN_COLUMNS = {
    "date",
    "agent",
    "depth",
    "total_tokens",
    "cacheRead",
    "cost",
    "failed",
    "duration_ms",
    "tool_calls",
}
MAIN_COLUMNS = {"date", "total_tokens", "cacheRead"}
BASELINE_COLOR = "#278f88"
DURATION_COLOR = "#64748b"
SPREAD_COLOR = "#7a6fb1"
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
SCALE_TICKS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]
SCALE_LABELS = ["1", "10", "100", "1K", "10K", "100K", "1M", "10M"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot per-role delegation economics from content-free Pi metric CSVs."
    )
    parser.add_argument("--subagent-runs-csv", type=Path, required=True)
    parser.add_argument(
        "--main-turns-csv",
        type=Path,
        help="Optional main-agent CSV drawn as an inline-work baseline reference.",
    )
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument(
        "--max-depth",
        type=int,
        help="Keep only runs at this delegation depth or shallower (depth starts at 1).",
    )
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def decimal(row: dict[str, str], field: str) -> float:
    """Read one fractional field with a useful error message."""
    value = row.get(field)
    try:
        return float(value or 0)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Invalid number for {field}: {value!r}") from error


def median(values: list[int]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[middle])
    return (ordered[middle - 1] + ordered[middle]) / 2


def summarize_roles(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Aggregate every retained run into one record per agent role."""
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[(row.get("agent") or "").strip() or "unnamed"].append(row)

    summaries: list[dict[str, Any]] = []
    for role, role_rows in grouped.items():
        failures = sum(integer(row, "failed") for row in role_rows)
        summaries.append(
            {
                "role": role,
                "runs": len(role_rows),
                "non_cache_tokens": sum(non_cache_tokens(row) for row in role_rows),
                "per_run_tokens": [integer(row, "total_tokens") for row in role_rows],
                "cost": sum(decimal(row, "cost") for row in role_rows),
                "failures": failures,
                "failure_rate": 100.0 * failures / len(role_rows),
                "median_duration_ms": median(
                    [integer(row, "duration_ms") for row in role_rows]
                ),
                "depths": sorted({integer(row, "depth") for row in role_rows}),
            }
        )
    summaries.sort(key=lambda summary: (-summary["non_cache_tokens"], summary["role"]))
    return summaries


def role_label(summary: dict[str, Any]) -> str:
    """Name a role, stating the delegation depths its runs came from."""
    depths = summary["depths"]
    span = (
        f"depth {depths[0]}"
        if len(depths) == 1
        else f"depth {depths[0]}–{depths[-1]}"
    )
    return f"{summary['role']}\n{span} · n={summary['runs']}"


def upper_log_limit(maximum: float) -> float:
    if maximum <= 0:
        return 10.0
    return 10 ** math.ceil(math.log10(maximum) + 0.1)


def draw_metric_panel(
    axis: Any,
    positions: Any,
    values: Any,
    colors: list[Any],
    *,
    title: str,
    xlabel: str,
    labels: list[str],
) -> None:
    """Draw one horizontal metric column of the role dashboard."""
    axis.barh(positions, values, height=0.58, color=colors, alpha=0.9)
    ceiling = max(float(max(values)), 1.0)
    axis.set_xlim(0, ceiling * 1.32)
    for position, value, label in zip(positions, values, labels, strict=True):
        axis.text(
            value + ceiling * 0.04,
            position,
            label,
            ha="left",
            va="center",
            fontsize=9,
            color=TEXT_COLOR,
        )
    axis.set_xlabel(xlabel)
    axis.set_title(title, loc="left", fontsize=12.5, fontweight="bold", pad=9)


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D

    all_rows = load_csv(args.subagent_runs_csv, RUN_COLUMNS)
    rows = all_rows
    if args.max_depth is not None:
        if args.max_depth < 1:
            raise ValueError("--max-depth must be at least 1")
        rows = [row for row in all_rows if integer(row, "depth") <= args.max_depth]
    if not rows:
        raise ValueError("No subagent runs remain after filtering")

    summaries = summarize_roles(rows)
    positions = np.arange(len(summaries), 0, -1)
    role_colors = [
        plt.colormaps["viridis"](value)
        for value in np.linspace(0.18, 0.82, len(summaries))
    ]
    failure_colors = [
        plt.colormaps["RdYlGn_r"](min(summary["failure_rate"], 40.0) / 40.0)
        for summary in summaries
    ]

    height = max(6.6, 1.02 * len(summaries) + 4.2)
    figure, axes = plt.subplots(
        1,
        5,
        figsize=(19.5, height),
        sharey=True,
        gridspec_kw={"width_ratios": [1.05, 0.62, 0.62, 0.68, 1.55], "wspace": 0.16},
    )
    token_axis, runs_axis, failure_axis, duration_axis, spread_axis = axes
    figure.patch.set_facecolor(BACKGROUND)
    for axis in axes:
        axis.set_facecolor("white")
        axis.spines[["top", "right"]].set_visible(False)
        axis.grid(axis="x", color="#dbe3ec", linewidth=0.85, alpha=0.95)
        axis.set_axisbelow(True)

    draw_metric_panel(
        token_axis,
        positions,
        [summary["non_cache_tokens"] / 1_000 for summary in summaries],
        role_colors,
        title="Total cost",
        xlabel="Non-cache tokens (thousands)",
        labels=[
            f"{summary['non_cache_tokens']:,} · ${summary['cost']:,.2f}"
            if summary["non_cache_tokens"] < 10_000
            else f"{summary['non_cache_tokens'] / 1_000:,.0f}K · ${summary['cost']:,.2f}"
            for summary in summaries
        ],
    )
    draw_metric_panel(
        runs_axis,
        positions,
        [summary["runs"] for summary in summaries],
        role_colors,
        title="How often",
        xlabel="Runs",
        labels=[f"{summary['runs']:,}" for summary in summaries],
    )
    draw_metric_panel(
        failure_axis,
        positions,
        [summary["failure_rate"] for summary in summaries],
        failure_colors,
        title="How reliably",
        xlabel="Failed runs (%)",
        labels=[
            f"{summary['failure_rate']:.0f}% ({summary['failures']}/{summary['runs']})"
            for summary in summaries
        ],
    )
    draw_metric_panel(
        duration_axis,
        positions,
        [summary["median_duration_ms"] / 1_000 for summary in summaries],
        [DURATION_COLOR] * len(summaries),
        title="How long",
        xlabel="Median run duration (s)",
        labels=[
            f"{summary['median_duration_ms'] / 1_000:,.0f}s" for summary in summaries
        ],
    )

    baseline_rows: list[dict[str, str]] = []
    baseline_tokens = 0
    if args.main_turns_csv:
        baseline_rows = load_csv(args.main_turns_csv, MAIN_COLUMNS)
        baseline_tokens = sum(non_cache_tokens(row) for row in baseline_rows)
        if baseline_tokens > 0:
            baseline_label = (
                f"main agent: {baseline_tokens / 1_000:,.0f}K over {len(baseline_rows):,} turns "
            )
            largest_role = max(summary["non_cache_tokens"] for summary in summaries)
            if baseline_tokens <= largest_role * 3:
                token_axis.axvline(
                    baseline_tokens / 1_000,
                    color=BASELINE_COLOR,
                    linewidth=1.8,
                    linestyle="--",
                    zorder=5,
                )
                token_axis.set_xlim(
                    0,
                    max(
                        float(token_axis.get_xlim()[1]),
                        baseline_tokens / 1_000 * 1.12,
                    ),
                )
                anchor = baseline_tokens / 1_000
            else:
                # Keep the role bars comparable rather than rescaling the panel
                # around a baseline that is several times larger than any role.
                anchor = float(token_axis.get_xlim()[1])
                baseline_label = f"{baseline_label.rstrip()} ▸ off scale "
            token_axis.text(
                anchor,
                0.995,
                baseline_label,
                transform=token_axis.get_xaxis_transform(),
                ha="right",
                va="top",
                fontsize=8.8,
                color=BASELINE_COLOR,
                fontweight="bold",
            )

    rng = np.random.default_rng(419)
    for position, summary, color in zip(positions, summaries, role_colors, strict=True):
        values = np.array(
            [value for value in summary["per_run_tokens"] if value > 0], dtype=float
        )
        if not len(values):
            spread_axis.text(
                0.02,
                position,
                "no positive-token run",
                transform=spread_axis.get_yaxis_transform(),
                ha="left",
                va="center",
                fontsize=8.8,
                color=MUTED_COLOR,
                fontstyle="italic",
            )
            continue
        boxes = spread_axis.boxplot(
            [values],
            positions=[position],
            orientation="horizontal",
            widths=0.44,
            patch_artist=True,
            showfliers=False,
            medianprops={"color": TEXT_COLOR, "linewidth": 2.0},
            whiskerprops={"color": "#667085", "linewidth": 1.1},
            capprops={"color": "#667085", "linewidth": 1.1},
        )
        box = boxes["boxes"][0]
        box.set_facecolor(color)
        box.set_alpha(0.22)
        box.set_edgecolor(color)
        box.set_linewidth(1.4)
        spread_axis.scatter(
            values,
            position + rng.normal(0, 0.07, size=len(values)),
            s=24,
            color=SPREAD_COLOR,
            edgecolors="white",
            linewidths=0.35,
            alpha=0.72,
            zorder=3,
        )

    positive_values = [
        value
        for summary in summaries
        for value in summary["per_run_tokens"]
        if value > 0
    ]
    if not positive_values:
        raise ValueError("No subagent run recorded a positive token count")
    spread_axis.set_xscale("log")
    spread_axis.set_xlim(
        max(1.0, 10 ** math.floor(math.log10(min(positive_values)))),
        upper_log_limit(max(positive_values)),
    )
    lower, upper = spread_axis.get_xlim()
    ticks = [
        (tick, label)
        for tick, label in zip(SCALE_TICKS, SCALE_LABELS, strict=True)
        if lower <= tick <= upper
    ]
    spread_axis.minorticks_off()
    spread_axis.set_xticks([tick for tick, _ in ticks], [label for _, label in ticks])
    spread_axis.set_xlabel("Tokens per individual run, cache included (log scale)")
    spread_axis.set_title(
        "Steady cost or occasional spike",
        loc="left",
        fontsize=12.5,
        fontweight="bold",
        pad=9,
    )

    token_axis.set_yticks(positions, [role_label(summary) for summary in summaries])
    token_axis.set_ylim(0.4, len(summaries) + 0.6)
    token_axis.tick_params(axis="y", labelsize=9.5)
    token_axis.set_ylabel("Agent role")

    handles = [
        Line2D([0], [0], color=TEXT_COLOR, linewidth=2, label="Median run"),
        Line2D(
            [0],
            [0],
            color="none",
            marker="o",
            markerfacecolor=SPREAD_COLOR,
            markeredgecolor="white",
            markersize=7,
            label="Individual run",
        ),
    ]
    if baseline_tokens > 0:
        handles.insert(
            0,
            Line2D(
                [0],
                [0],
                color=BASELINE_COLOR,
                linewidth=1.8,
                linestyle="--",
                label="Main-agent non-cache total (baseline, off scale when far larger)",
            ),
        )
    figure.legend(
        handles=handles,
        loc="upper left",
        bbox_to_anchor=(0.052, 1 - 1.30 / height),
        ncols=3,
        frameon=False,
        borderaxespad=0,
        columnspacing=1.35,
    )

    dates = sorted({row["date"] for row in rows if row.get("date")})
    coverage = (
        f"{date_label(dates[0])} – {date_label(dates[-1])} ({args.timezone_label})"
        if dates
        else "no dated rows"
    )
    delegated_tokens = sum(summary["non_cache_tokens"] for summary in summaries)
    share = (
        f" • delegation holds {100.0 * delegated_tokens / (delegated_tokens + baseline_tokens):.0f}% of non-cache tokens"
        if baseline_tokens > 0
        else ""
    )
    nested = sum(1 for row in rows if integer(row, "depth") > 1)
    figure.suptitle(
        "Delegation economics — what each agent role costs and how reliably it returns",
        x=0.052,
        y=1 - 0.38 / height,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.052,
        1 - 0.92 / height,
        (
            f"{len(summaries)} roles • {len(rows):,} runs ({nested:,} nested below depth 1) • "
            f"{delegated_tokens:,} non-cache tokens • "
            f"${sum(summary['cost'] for summary in summaries):,.2f} • {coverage}{share}"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    depth_text = (
        f"Runs deeper than depth {args.max_depth} are excluded by --max-depth."
        if args.max_depth is not None
        else "Every delegation depth is included; a nested run counts toward the role that ran it."
    )
    figure.text(
        0.052,
        0.34 / height,
        (
            f"The first four panels total non-cache tokens (input + output + cache write); the last panel shows cache-inclusive tokens per run. {depth_text}\n"
            "The baseline is a scale reference, not a like-for-like comparison: main turns and delegated runs do different work, and a role's failure rate counts returned failures only."
        ),
        ha="left",
        fontsize=9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(
        left=0.075, right=0.99, top=1 - 1.95 / height, bottom=1.35 / height
    )

    ensure_parent(args.png)
    figure.savefig(args.png, dpi=200, facecolor=figure.get_facecolor())
    if args.svg:
        ensure_parent(args.svg)
        figure.savefig(
            args.svg,
            facecolor=figure.get_facecolor(),
            metadata={"Date": None},
        )
    plt.close(figure)


def main() -> None:
    try:
        plot(parse_args())
    except ValueError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
