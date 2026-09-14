#!/usr/bin/env python3
"""Plot per-tool call volume beside its clean, truncated, and error composition.

The CSV rows are aggregates, so the overlap between an errored result and a
truncated result is unobservable: one row reports `errors` and `truncated`
independently and never their intersection. This plot therefore assumes
maximal overlap — every truncated result that could also be an error is
counted as an error — and charges the truncated segment only with the
remainder, `max(0, truncated - errors)`. That keeps the segments additive,
never double-counts a result, and reports the smallest defensible
truncation-only share rather than an inflated one.

Composition is drawn as a separate percentage panel instead of stacking
segments onto the volume bar. Call counts routinely span orders of magnitude,
and a stacked segment on a logarithmic axis encodes no readable proportion, so
volume and composition are kept on their own honest scales.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from _common import date_label, ensure_parent, integer, load_csv

REQUIRED_COLUMNS = {"date", "tool", "calls", "results", "errors", "truncated"}
CLEAN_COLOR = "#278f88"
TRUNCATED_COLOR = "#d97706"
ERROR_COLOR = "#b4344a"
PENDING_COLOR = "#94a3b8"
VOLUME_COLOR = "#4c6d9c"
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
LOG_SPAN_THRESHOLD = 50
SCALE_TICKS = [1, 10, 100, 1_000, 10_000, 100_000]
SCALE_LABELS = ["1", "10", "100", "1K", "10K", "100K"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot the reliability profile of each tool from content-free Pi metric CSVs."
    )
    parser.add_argument("--tool-usage-csv", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument(
        "--top",
        type=int,
        help="Keep only the N busiest tools by total calls.",
    )
    parser.add_argument(
        "--log-scale",
        choices=("auto", "on", "off"),
        default="auto",
        help=(
            "Volume axis scaling. 'auto' uses a log axis when the busiest tool "
            f"makes at least {LOG_SPAN_THRESHOLD}x the calls of the quietest one."
        ),
    )
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def summarize_tools(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Total each tool across dates and runtimes, splitting outcome segments additively."""
    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"calls": 0, "results": 0, "errors": 0, "truncated": 0}
    )
    for row in rows:
        tool = row.get("tool") or "unattributed"
        entry = totals[tool]
        for field in ("calls", "results", "errors", "truncated"):
            entry[field] += integer(row, field)

    summaries: list[dict[str, Any]] = []
    for tool, entry in totals.items():
        results = min(entry["results"], entry["calls"])
        errors = min(entry["errors"], results)
        truncated_only = min(max(entry["truncated"] - entry["errors"], 0), results - errors)
        summaries.append(
            {
                "tool": tool,
                "calls": entry["calls"],
                "results": results,
                "errors": errors,
                "truncated_only": truncated_only,
                "clean": results - errors - truncated_only,
                "unreturned": max(entry["calls"] - results, 0),
            }
        )
    summaries.sort(key=lambda summary: (-summary["calls"], summary["tool"]))
    return summaries


def use_log_scale(choice: str, calls: list[int]) -> bool:
    if choice != "auto":
        return choice == "on"
    positive = [value for value in calls if value > 0]
    if not positive:
        return False
    return max(positive) >= LOG_SPAN_THRESHOLD * min(positive)


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.patches import Patch

    rows = load_csv(args.tool_usage_csv, REQUIRED_COLUMNS)
    if not rows:
        raise ValueError("The tool-usage CSV has no observations")
    if args.top is not None and args.top < 1:
        raise ValueError("--top must be positive")

    summaries = [summary for summary in summarize_tools(rows) if summary["calls"] > 0]
    if not summaries:
        raise ValueError("No tool in the CSV recorded a single call")
    hidden = 0
    if args.top is not None and args.top < len(summaries):
        hidden = len(summaries) - args.top
        summaries = summaries[: args.top]

    dates = sorted({row["date"] for row in rows if row.get("date")})
    tools = [summary["tool"] for summary in summaries]
    calls = [summary["calls"] for summary in summaries]
    positions = np.arange(len(summaries), 0, -1)
    logarithmic = use_log_scale(args.log_scale, calls)

    height = max(6.4, 0.82 * len(summaries) + 4.0)
    figure, (volume_axis, composition_axis) = plt.subplots(
        1,
        2,
        figsize=(16.5, height),
        sharey=True,
        gridspec_kw={"width_ratios": [1.05, 1]},
    )
    figure.patch.set_facecolor(BACKGROUND)
    for axis in (volume_axis, composition_axis):
        axis.set_facecolor("white")
        axis.spines[["top", "right"]].set_visible(False)
        axis.grid(axis="x", color="#dbe3ec", linewidth=0.85, alpha=0.95)
        axis.set_axisbelow(True)

    volume_axis.barh(positions, calls, height=0.62, color=VOLUME_COLOR, alpha=0.9)
    upper = max(calls) * (2.6 if logarithmic else 1.22)
    if logarithmic:
        volume_axis.set_xscale("log")
        volume_axis.set_xlim(0.8, upper)
        volume_axis.minorticks_off()
        ticks = [
            (tick, label)
            for tick, label in zip(SCALE_TICKS, SCALE_LABELS, strict=True)
            if tick <= upper
        ]
        volume_axis.set_xticks(
            [tick for tick, _ in ticks], [label for _, label in ticks]
        )
    else:
        volume_axis.set_xlim(0, upper)
    for position, count in zip(positions, calls, strict=True):
        volume_axis.text(
            count * 1.07 if logarithmic else count + max(calls) * 0.012,
            position,
            f"{count:,}",
            ha="left",
            va="center",
            fontsize=9.4,
            color=TEXT_COLOR,
            fontweight="bold",
        )
    volume_axis.set_yticks(positions, tools)
    volume_axis.set_ylim(0.4, len(summaries) + 0.6)
    volume_axis.set_xlabel(
        "Tool calls" + (" (log scale)" if logarithmic else "")
    )
    volume_axis.set_ylabel("Tool")
    volume_axis.set_title(
        "How busy each tool is", loc="left", fontsize=14.5, fontweight="bold", pad=11
    )

    segments = [
        ("clean", CLEAN_COLOR),
        ("truncated_only", TRUNCATED_COLOR),
        ("errors", ERROR_COLOR),
        ("unreturned", PENDING_COLOR),
    ]
    left = np.zeros(len(summaries), dtype=float)
    for field, color in segments:
        share = np.array(
            [
                100.0 * summary[field] / summary["calls"]
                for summary in summaries
            ],
            dtype=float,
        )
        composition_axis.barh(
            positions, share, height=0.62, left=left, color=color, alpha=0.92
        )
        for position, value, offset in zip(positions, share, left, strict=True):
            if value < 7:
                continue
            composition_axis.text(
                offset + value / 2,
                position,
                f"{value:.0f}%",
                ha="center",
                va="center",
                fontsize=8.6,
                color="white",
                fontweight="bold",
            )
        left = left + share
    composition_axis.set_xlim(0, 100)
    composition_axis.set_xticks([0, 25, 50, 75, 100], ["0%", "25%", "50%", "75%", "100%"])
    composition_axis.set_xlabel("Share of calls by outcome")
    composition_axis.set_title(
        "Where each tool actually fails",
        loc="left",
        fontsize=14.5,
        fontweight="bold",
        pad=11,
    )
    for position, summary in zip(positions, summaries, strict=True):
        composition_axis.text(
            101.2,
            position,
            f"{100.0 * summary['errors'] / summary['calls']:.1f}% err · "
            f"{100.0 * summary['truncated_only'] / summary['calls']:.1f}% trunc.",
            ha="left",
            va="center",
            fontsize=8.6,
            color=MUTED_COLOR,
        )

    figure.legend(
        handles=[
            Patch(facecolor=CLEAN_COLOR, label="Clean result"),
            Patch(facecolor=TRUNCATED_COLOR, label="Truncated, not errored"),
            Patch(facecolor=ERROR_COLOR, label="Errored (absorbs the truncation overlap)"),
            Patch(facecolor=PENDING_COLOR, label="Call without a recorded result"),
        ],
        loc="upper left",
        bbox_to_anchor=(0.062, 1 - 1.30 / height),
        ncols=4,
        frameon=False,
        borderaxespad=0,
        columnspacing=1.35,
    )

    total_calls = sum(calls)
    total_errors = sum(summary["errors"] for summary in summaries)
    total_truncated = sum(summary["truncated_only"] for summary in summaries)
    coverage = (
        f"{date_label(dates[0])} – {date_label(dates[-1])} ({args.timezone_label})"
        if dates
        else "no dated rows"
    )
    figure.suptitle(
        "Tool reliability profile — volume beside outcome composition",
        x=0.062,
        y=1 - 0.42 / height,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.062,
        1 - 0.92 / height,
        (
            f"{len(summaries):,} tools • {total_calls:,} calls • "
            f"{total_errors:,} errored ({100.0 * total_errors / total_calls:.1f}%) • "
            f"{total_truncated:,} truncated-only ({100.0 * total_truncated / total_calls:.1f}%) • "
            f"{coverage}"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    hidden_text = f" {hidden} quieter tools are omitted by --top." if hidden else ""
    figure.text(
        0.062,
        0.34 / height,
        (
            "Rows are per-date, per-runtime aggregates summed across every runtime, including unattributed rows. "
            "A result can be both errored and truncated; the error segment absorbs that overlap, so the truncation segment is a lower bound.\n"
            "High truncation argues for tighter read bounds at the call site; a high error share argues for fixing the tool wrapper or the guidance that invokes it."
            f"{hidden_text}"
        ),
        ha="left",
        fontsize=9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(
        left=0.115,
        right=0.895,
        top=1 - 1.95 / height,
        bottom=1.45 / height,
        wspace=0.08,
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
