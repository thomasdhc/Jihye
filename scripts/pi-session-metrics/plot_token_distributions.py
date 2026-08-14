#!/usr/bin/env python3
"""Plot cache-inclusive and non-cache main/subagent token distributions."""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any, Callable

from _common import date_label, ensure_parent, integer, load_csv, non_cache_tokens

MAIN_COLUMNS = {"date", "total_tokens", "cacheRead", "used_subagents"}
CHILD_COLUMNS = {"date", "total_tokens", "cacheRead"}
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
MEAN_COLOR = "#9a4d00"
SCALE_TICKS = [
    1,
    10,
    100,
    1_000,
    10_000,
    100_000,
    1_000_000,
    10_000_000,
    100_000_000,
]
SCALE_LABELS = ["1", "10", "100", "1K", "10K", "100K", "1M", "10M", "100M"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot paired main-agent and subagent token distributions."
    )
    parser.add_argument("--main-turns-csv", type=Path, required=True)
    parser.add_argument("--subagent-runs-csv", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--svg",
        action="store_true",
        help="Write matching SVG files in addition to PNG files.",
    )
    return parser.parse_args()


def upper_log_limit(maximum: float) -> float:
    candidates = [
        1_000,
        10_000,
        100_000,
        1_000_000,
        2_000_000,
        5_000_000,
        10_000_000,
        20_000_000,
        50_000_000,
        100_000_000,
    ]
    for candidate in candidates:
        if maximum <= candidate:
            return float(candidate)
    return 10 ** math.ceil(math.log10(maximum)) * 1.05


def lower_log_limit(minimum: float, preferred: float) -> float:
    if minimum >= preferred:
        return preferred
    return max(1, 10 ** math.floor(math.log10(minimum)))


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D

    main_rows = load_csv(args.main_turns_csv, MAIN_COLUMNS)
    child_rows = load_csv(args.subagent_runs_csv, CHILD_COLUMNS)
    if not main_rows:
        raise ValueError("The main-turn CSV has no observations")

    args.output_dir.mkdir(parents=True, exist_ok=True)

    def style_axis(axis: Any, values: list[float], preferred_lower: float) -> None:
        lower = lower_log_limit(min(values), preferred_lower)
        upper = upper_log_limit(max(values))
        axis.set_facecolor("white")
        axis.spines[["top", "right"]].set_visible(False)
        axis.set_xscale("log")
        axis.set_xlim(lower, upper)
        ticks = [
            (tick, label)
            for tick, label in zip(SCALE_TICKS, SCALE_LABELS, strict=True)
            if lower <= tick <= upper
        ]
        axis.set_xticks([tick for tick, _ in ticks], [label for _, label in ticks])
        axis.grid(axis="x", color="#dbe3ec", linewidth=0.85, alpha=0.95)
        axis.set_axisbelow(True)

    def add_marks(
        axis: Any,
        dates: list[str],
        positions: Any,
        rows_by_date: dict[str, list[dict[str, str]]],
        metric: Callable[[dict[str, str]], int],
        colors: list[Any],
        *,
        seed: int,
        main_agent: bool,
    ) -> None:
        rng = np.random.default_rng(seed)
        for day, position, color in zip(dates, positions, colors, strict=True):
            day_rows = [row for row in rows_by_date[day] if metric(row) > 0]
            if not day_rows:
                continue
            values = np.array([metric(row) for row in day_rows], dtype=float)
            boxplot = axis.boxplot(
                [values],
                positions=[position],
                orientation="horizontal",
                widths=0.42,
                patch_artist=True,
                showfliers=False,
                medianprops={"color": TEXT_COLOR, "linewidth": 2.1},
                whiskerprops={"color": "#667085", "linewidth": 1.15},
                capprops={"color": "#667085", "linewidth": 1.15},
            )
            patch = boxplot["boxes"][0]
            patch.set_facecolor(color)
            patch.set_alpha(0.24)
            patch.set_edgecolor(color)
            patch.set_linewidth(1.5)

            jitter = rng.normal(0, 0.075, size=len(values))
            highlighted = np.array(
                [
                    integer(row, "used_subagents") > 0 if main_agent else True
                    for row in day_rows
                ],
                dtype=bool,
            )
            regular = ~highlighted
            if regular.any():
                axis.scatter(
                    values[regular],
                    position + jitter[regular],
                    s=23,
                    marker="o",
                    color=color,
                    edgecolor="white",
                    linewidth=0.32,
                    alpha=0.68,
                    zorder=3,
                )
            if highlighted.any():
                axis.scatter(
                    values[highlighted],
                    position + jitter[highlighted],
                    marker="^",
                    s=42,
                    color=color,
                    edgecolor="white",
                    linewidth=0.48,
                    alpha=0.68,
                    zorder=4,
                )
            axis.scatter(
                values.mean(),
                position,
                marker="D",
                s=68,
                color=MEAN_COLOR,
                edgecolor="white",
                linewidth=0.75,
                zorder=5,
            )

    def plot_metric(*, exclude_cache_reads: bool) -> None:
        metric = non_cache_tokens if exclude_cache_reads else lambda row: integer(
            row, "total_tokens"
        )
        valid_main = [row for row in main_rows if metric(row) > 0]
        valid_children = [row for row in child_rows if metric(row) > 0]
        dates = sorted(
            {row["date"] for row in valid_main}
            | {row["date"] for row in valid_children}
        )
        if not valid_main:
            label = "non-cache" if exclude_cache_reads else "cache-inclusive"
            raise ValueError(f"No positive {label} parent observations")

        main_by_date = {
            day: [row for row in valid_main if row["date"] == day] for day in dates
        }
        child_by_date = {
            day: [row for row in valid_children if row["date"] == day]
            for day in dates
        }
        all_values = [float(metric(row)) for row in valid_main + valid_children]
        positions = np.arange(len(dates), 0, -1)
        colors = [
            plt.colormaps["viridis"](value)
            for value in np.linspace(0.12, 0.88, len(dates))
        ]

        figure, (main_axis, child_axis) = plt.subplots(
            1, 2, figsize=(19, 10), sharey=True
        )
        figure.patch.set_facecolor(BACKGROUND)
        preferred_lower = 100 if exclude_cache_reads else 1_000
        for axis in (main_axis, child_axis):
            style_axis(axis, all_values, preferred_lower)

        add_marks(
            main_axis,
            dates,
            positions,
            main_by_date,
            metric,
            colors,
            seed=149,
            main_agent=True,
        )
        add_marks(
            child_axis,
            dates,
            positions,
            child_by_date,
            metric,
            colors,
            seed=211,
            main_agent=False,
        )

        main_axis.set_yticks(
            positions,
            [
                f"{date_label(day)}  (parent n={len(main_by_date[day])}, "
                f"child n={len(child_by_date[day])})"
                for day in dates
            ],
        )
        main_axis.set_ylim(0.45, len(dates) + 0.55)
        main_axis.set_ylabel("Parent-turn date and observation counts")
        child_axis.tick_params(axis="y", labelleft=False)
        if exclude_cache_reads:
            main_axis.set_xlabel(
                "Direct main-agent non-cache tokens per parent turn (log scale)"
            )
            child_axis.set_xlabel(
                "Non-cache tokens per individual subagent run (log scale)"
            )
        else:
            main_axis.set_xlabel(
                "Direct main-agent tokens per parent turn (log scale)"
            )
            child_axis.set_xlabel("Tokens per individual subagent run (log scale)")
        main_axis.set_title(
            "Main agent only", loc="left", fontsize=15, fontweight="bold", pad=12
        )
        child_axis.set_title(
            "Subagents only", loc="left", fontsize=15, fontweight="bold", pad=12
        )

        figure.legend(
            handles=[
                Line2D(
                    [0],
                    [0],
                    marker="o",
                    color="none",
                    markerfacecolor="#64748b",
                    markeredgecolor="white",
                    markersize=7,
                    label="Main turn without delegation",
                ),
                Line2D(
                    [0],
                    [0],
                    marker="^",
                    color="none",
                    markerfacecolor="#64748b",
                    markeredgecolor="white",
                    markersize=8,
                    label="Delegated main turn or subagent run (see panel)",
                ),
                Line2D(
                    [0],
                    [0],
                    marker="D",
                    color="none",
                    markerfacecolor=MEAN_COLOR,
                    markeredgecolor="white",
                    markersize=7,
                    label="Mean",
                ),
                Line2D([0], [0], color=TEXT_COLOR, linewidth=2, label="Median"),
            ],
            loc="upper left",
            bbox_to_anchor=(0.19, 0.895),
            ncols=4,
            frameon=False,
            borderaxespad=0,
            columnspacing=1.25,
        )

        metric_name = "non-cache token" if exclude_cache_reads else "token"
        figure.suptitle(
            f"Main-agent and subagent {metric_name} distributions, kept separate",
            x=0.045,
            y=0.98,
            ha="left",
            fontsize=20,
            fontweight="bold",
            color=TEXT_COLOR,
        )
        figure.text(
            0.045,
            0.94,
            (
                f"{len(valid_main):,} nonzero parent turns on the left • "
                f"{len(valid_children):,} nonzero child runs on the right • "
                "independent boxes and whiskers, shared token scale"
            ),
            ha="left",
            fontsize=10.8,
            color="#4b5563",
        )
        definition = (
            "Non-cache tokens = input + output + cache write; cache-read tokens are excluded."
            if exclude_cache_reads
            else "Token usage includes input, output, cache read, and cache write."
        )
        figure.text(
            0.045,
            0.022,
            (
                f"{definition} Main-agent usage excludes child model calls; child runs are individual observations rather than sums per parent turn. Colors identify date rows.\n"
                f"Excluded nonpositive observations for this view: {len(main_rows) - len(valid_main)} parent turns and "
                f"{len(child_rows) - len(valid_children)} child runs."
            ),
            ha="left",
            fontsize=9,
            color=MUTED_COLOR,
        )
        figure.subplots_adjust(
            left=0.19, right=0.98, top=0.79, bottom=0.12, wspace=0.12
        )

        stem = (
            "main_and_subagent_non_cache_distribution"
            if exclude_cache_reads
            else "main_and_subagent_separate_distribution"
        )
        png_path = args.output_dir / f"{stem}.png"
        ensure_parent(png_path)
        figure.savefig(png_path, dpi=200, facecolor=figure.get_facecolor())
        if args.svg:
            svg_path = args.output_dir / f"{stem}.svg"
            figure.savefig(
                svg_path,
                facecolor=figure.get_facecolor(),
                metadata={"Date": None},
            )
        plt.close(figure)

    plot_metric(exclude_cache_reads=False)
    plot_metric(exclude_cache_reads=True)


def main() -> None:
    try:
        plot(parse_args())
    except ValueError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
