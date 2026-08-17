#!/usr/bin/env python3
"""Plot tool error and truncation rates per 100 calls over the date axis.

Rates, not counts, are the point of this view: a raw count of failures only
tracks how busy the day was, while a rate answers whether the setup is getting
more reliable. Counts appear solely as a light background volume series so the
reader can weigh each point.

Small-denominator rule: a date whose total call count is below `--min-calls`
is drawn as a hollow marker on a faint dotted connector and is excluded from
the solid trend line and from the headline averages, because one failure out of
two calls is not comparable to forty out of four thousand.

When the CSV carries more than one `jihye_version`, the date axis is banded by
the version that made most of that date's calls, so a reliability shift can be
read against a guidance change. Rows with an empty runtime column are banded as
`unattributed` rather than dropped.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from _common import date_label, ensure_parent, integer, load_csv

REQUIRED_COLUMNS = {"date", "tool", "calls", "errors", "truncated", "jihye_version"}
UNATTRIBUTED = "unattributed"
ERROR_COLOR = "#b4344a"
TRUNCATED_COLOR = "#d97706"
VOLUME_COLOR = "#c3cedd"
BAND_COLORS = ["#e8eef7", "#f3ece2", "#e6f1ee", "#f2e9f1"]
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
DEFAULT_MIN_CALLS = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot tool error and truncation rates per 100 calls across dates."
    )
    parser.add_argument("--tool-usage-csv", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument(
        "--tool",
        action="append",
        dest="tools",
        metavar="NAME",
        help="Restrict the trend to this tool. Repeatable.",
    )
    parser.add_argument(
        "--min-calls",
        type=int,
        default=DEFAULT_MIN_CALLS,
        help=(
            "Minimum calls on a date before its rate is treated as trustworthy "
            f"(default: {DEFAULT_MIN_CALLS})."
        ),
    )
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def runtime_label(value: str | None) -> str:
    """Name the runtime, keeping unattributed rows as an explicit group."""
    return (value or "").strip() or UNATTRIBUTED


def summarize_dates(rows: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    """Total calls, errors, and truncations per date with the busiest runtime version."""
    totals: dict[str, dict[str, Any]] = {}
    for row in rows:
        day = row["date"]
        entry = totals.setdefault(
            day,
            {"calls": 0, "errors": 0, "truncated": 0, "calls_by_version": defaultdict(int)},
        )
        calls = integer(row, "calls")
        entry["calls"] += calls
        entry["errors"] += integer(row, "errors")
        entry["truncated"] += integer(row, "truncated")
        entry["calls_by_version"][runtime_label(row.get("jihye_version"))] += calls
    for entry in totals.values():
        by_version: dict[str, int] = entry.pop("calls_by_version")
        entry["version"] = max(
            sorted(by_version), key=lambda version: by_version[version]
        )
    return totals


def version_bands(versions: list[str]) -> list[tuple[int, int, str]]:
    """Collapse the per-date version series into contiguous (start, end, version) bands."""
    bands: list[tuple[int, int, str]] = []
    for index, version in enumerate(versions):
        if bands and bands[-1][2] == version:
            start, _, current = bands[-1]
            bands[-1] = (start, index, current)
        else:
            bands.append((index, index, version))
    return bands


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    if args.min_calls < 1:
        raise ValueError("--min-calls must be positive")
    all_rows = load_csv(args.tool_usage_csv, REQUIRED_COLUMNS)
    rows = all_rows
    if args.tools:
        selected = set(args.tools)
        rows = [row for row in all_rows if row["tool"] in selected]
        missing = sorted(selected - {row["tool"] for row in all_rows})
        if missing:
            raise ValueError(f"No rows for requested tools: {', '.join(missing)}")
    if not rows:
        raise ValueError("The tool-usage CSV has no observations")

    totals = summarize_dates(rows)
    dates = sorted(day for day, entry in totals.items() if entry["calls"] > 0)
    if not dates:
        raise ValueError("No date in the selected scope recorded a single call")

    x = np.arange(len(dates))
    calls = np.array([totals[day]["calls"] for day in dates], dtype=float)
    error_rate = np.array(
        [100.0 * totals[day]["errors"] / totals[day]["calls"] for day in dates]
    )
    truncated_rate = np.array(
        [100.0 * totals[day]["truncated"] / totals[day]["calls"] for day in dates]
    )
    trusted = calls >= args.min_calls
    versions = [totals[day]["version"] for day in dates]
    bands = version_bands(versions)
    distinct_versions = sorted(set(versions))

    figure, rate_axis = plt.subplots(figsize=(15.5, 8.4))
    figure.patch.set_facecolor(BACKGROUND)
    rate_axis.set_facecolor("white")
    rate_axis.spines[["top", "right"]].set_visible(False)
    rate_axis.grid(axis="y", color="#dbe3ec", linewidth=0.85, alpha=0.95)
    rate_axis.set_axisbelow(True)

    volume_axis = rate_axis.twinx()
    volume_axis.spines[["top", "left"]].set_visible(False)
    volume_axis.bar(x, calls, width=0.66, color=VOLUME_COLOR, alpha=0.55, zorder=1)
    volume_axis.set_ylim(0, float(calls.max()) * 3.1)
    volume_axis.set_ylabel("Tool calls per date (background bars)", color=MUTED_COLOR)
    volume_axis.tick_params(axis="y", colors=MUTED_COLOR, labelsize=9)
    rate_axis.set_zorder(volume_axis.get_zorder() + 1)
    rate_axis.patch.set_visible(False)

    if len(distinct_versions) > 1:
        palette = {
            version: BAND_COLORS[index % len(BAND_COLORS)]
            for index, version in enumerate(distinct_versions)
        }
        for start, end, version in bands:
            rate_axis.axvspan(
                start - 0.5, end + 0.5, color=palette[version], alpha=0.85, zorder=0
            )
            rate_axis.text(
                (start + end) / 2,
                1.0,
                version,
                transform=rate_axis.get_xaxis_transform(),
                ha="center",
                va="bottom",
                fontsize=9,
                color=MUTED_COLOR,
                fontweight="bold",
            )

    for values, color, label in (
        (error_rate, ERROR_COLOR, "Error rate"),
        (truncated_rate, TRUNCATED_COLOR, "Truncation rate"),
    ):
        rate_axis.plot(
            x,
            values,
            color=color,
            linewidth=1.0,
            linestyle=":",
            alpha=0.45,
            zorder=3,
        )
        solid = np.where(trusted, values, np.nan)
        rate_axis.plot(x, solid, color=color, linewidth=2.1, zorder=4, label=label)
        rate_axis.scatter(
            x[trusted],
            values[trusted],
            s=46,
            color=color,
            edgecolors="white",
            linewidths=0.8,
            zorder=5,
        )
        if (~trusted).any():
            rate_axis.scatter(
                x[~trusted],
                values[~trusted],
                s=40,
                facecolors="none",
                edgecolors=color,
                linewidths=1.2,
                alpha=0.6,
                zorder=5,
            )

    ceiling = max(float(np.nanmax(error_rate)), float(np.nanmax(truncated_rate)), 1.0)
    rate_axis.set_ylim(0, ceiling * 1.35)
    rate_axis.set_ylabel("Outcomes per 100 tool calls")
    rate_axis.set_xlim(-0.6, len(dates) - 0.4)
    rate_axis.set_xticks(
        x,
        [f"{date_label(day)}\n{int(total):,} calls" for day, total in zip(dates, calls, strict=True)],
    )
    rate_axis.set_xlabel(f"Date of tool call ({args.timezone_label})")

    handles: list[Any] = [
        Line2D([0], [0], color=ERROR_COLOR, linewidth=2.1, marker="o", markeredgecolor="white", label="Error rate"),
        Line2D([0], [0], color=TRUNCATED_COLOR, linewidth=2.1, marker="o", markeredgecolor="white", label="Truncation rate"),
        Line2D(
            [0],
            [0],
            color=MUTED_COLOR,
            linewidth=1.0,
            linestyle=":",
            marker="o",
            markerfacecolor="none",
            label=f"Fewer than {args.min_calls} calls — not trusted",
        ),
        Patch(facecolor=VOLUME_COLOR, label="Tool calls on that date"),
    ]
    if len(distinct_versions) > 1:
        handles.append(Patch(facecolor=BAND_COLORS[0], label="Band = busiest jihye_version"))
    figure.legend(
        handles=handles,
        loc="upper left",
        bbox_to_anchor=(0.062, 0.878),
        ncols=5,
        frameon=False,
        borderaxespad=0,
        columnspacing=1.35,
    )

    trusted_calls = float(calls[trusted].sum())
    trusted_errors = sum(
        totals[day]["errors"] for day, keep in zip(dates, trusted, strict=True) if keep
    )
    trusted_truncated = sum(
        totals[day]["truncated"] for day, keep in zip(dates, trusted, strict=True) if keep
    )
    headline = (
        f"{100.0 * trusted_errors / trusted_calls:.2f} errors and "
        f"{100.0 * trusted_truncated / trusted_calls:.2f} truncations per 100 calls across trusted dates"
        if trusted_calls
        else f"no date reached the {args.min_calls}-call threshold"
    )
    scope = ", ".join(sorted(args.tools)) if args.tools else "all tools"
    figure.suptitle(
        "Tool reliability trend — failures per 100 calls, not raw failure counts",
        x=0.062,
        y=0.978,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.062,
        0.925,
        (
            f"{scope} • {len(dates)} dates • {int(calls.sum()):,} calls • "
            f"{int(trusted.sum())} dates at or above {args.min_calls} calls • {headline}"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    version_text = (
        "One jihye_version covers the whole range, so no version bands are drawn."
        if len(distinct_versions) <= 1
        else f"Version bands: {', '.join(distinct_versions)} (each date is banded by the version that made most of its calls)."
    )
    figure.text(
        0.062,
        0.022,
        (
            "Rates share one denominator: every tool call recorded on that date across all runtimes, including unattributed rows. "
            "A result can be both errored and truncated, so the two rates can overlap.\n"
            f"{version_text} Background bars show call volume on an independent right-hand scale."
        ),
        ha="left",
        fontsize=9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(left=0.068, right=0.925, top=0.79, bottom=0.145)

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
