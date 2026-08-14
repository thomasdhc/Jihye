#!/usr/bin/env python3
"""Plot context epochs split at Pi compaction boundaries."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from _common import date_label, ensure_parent, integer, load_csv

REQUIRED_COLUMNS = {
    "start_date",
    "epoch_type",
    "persisted_user_messages_introduced",
    "main_provider_events",
}
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
MEAN_COLOR = "#9a4d00"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot linear context-epoch distributions from content-free CSV metrics."
    )
    parser.add_argument("--epochs-csv", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument(
        "--max-user-messages",
        type=int,
        help="Omit whole epochs above this user-message count from both panels.",
    )
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def axis_ceiling(maximum: int, step: int) -> int:
    return max(step, ((maximum + step - 1) // step) * step)


def add_epoch_panel(
    axis: Any,
    dates: list[str],
    rows_by_date: dict[str, list[dict[str, str]]],
    colors: list[Any],
    *,
    field: str,
    title: str,
    ylabel: str,
    step: int,
    seed: int,
) -> None:
    import numpy as np

    groups = [
        np.array([integer(row, field) for row in rows_by_date[day]], dtype=float)
        for day in dates
    ]
    positions = np.arange(len(dates))
    boxes = axis.boxplot(
        groups,
        positions=positions,
        widths=0.50,
        patch_artist=True,
        showfliers=False,
        medianprops={"color": TEXT_COLOR, "linewidth": 2.0},
        whiskerprops={"color": "#667085", "linewidth": 1.1},
        capprops={"color": "#667085", "linewidth": 1.1},
    )
    for box, color in zip(boxes["boxes"], colors, strict=True):
        box.set_facecolor(color)
        box.set_alpha(0.20)
        box.set_edgecolor(color)
        box.set_linewidth(1.45)

    rng = np.random.default_rng(seed)
    for index, (day, values, color) in enumerate(
        zip(dates, groups, colors, strict=True)
    ):
        day_rows = rows_by_date[day]
        jitter = rng.normal(0, 0.065, size=len(day_rows))
        initial = np.array(
            [row["epoch_type"] == "initial" for row in day_rows], dtype=bool
        )
        post_compaction = ~initial
        if initial.any():
            axis.scatter(
                index + jitter[initial],
                values[initial],
                s=29,
                marker="o",
                color=color,
                edgecolors="white",
                linewidths=0.45,
                alpha=0.75,
                zorder=3,
            )
        if post_compaction.any():
            axis.scatter(
                index + jitter[post_compaction],
                values[post_compaction],
                s=39,
                marker="^",
                color=color,
                edgecolors="white",
                linewidths=0.55,
                alpha=0.80,
                zorder=4,
            )
        axis.scatter(
            index,
            values.mean(),
            marker="D",
            s=62,
            color=MEAN_COLOR,
            edgecolors="white",
            linewidths=0.75,
            zorder=5,
        )

    maximum = max(int(values.max()) for values in groups)
    ceiling = axis_ceiling(maximum, step)
    axis.set_ylim(0, ceiling * 1.04)
    axis.set_yticks(list(range(0, ceiling + 1, step)))
    axis.set_ylabel(ylabel)
    axis.set_title(title, loc="left", fontsize=14.5, fontweight="bold")


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D

    all_rows = load_csv(args.epochs_csv, REQUIRED_COLUMNS)
    active_rows = [row for row in all_rows if integer(row, "main_provider_events") > 0]
    filtered_rows = active_rows
    trimmed_rows: list[dict[str, str]] = []
    if args.max_user_messages is not None:
        if args.max_user_messages < 1:
            raise ValueError("--max-user-messages must be positive")
        trimmed_rows = [
            row
            for row in active_rows
            if integer(row, "persisted_user_messages_introduced")
            > args.max_user_messages
        ]
        filtered_rows = [row for row in active_rows if row not in trimmed_rows]
    if not filtered_rows:
        raise ValueError("No active context epochs remain after filtering")

    dates = sorted({row["start_date"] for row in filtered_rows})
    rows_by_date = {
        day: [row for row in filtered_rows if row["start_date"] == day]
        for day in dates
    }
    colors = [
        plt.colormaps["viridis"](value)
        for value in np.linspace(0.12, 0.88, len(dates))
    ]

    figure, (events_axis, messages_axis) = plt.subplots(
        2,
        1,
        figsize=(15.5, 11.6),
        sharex=True,
        gridspec_kw={"hspace": 0.26},
    )
    figure.patch.set_facecolor(BACKGROUND)
    for axis in (events_axis, messages_axis):
        axis.set_facecolor("white")
        axis.spines[["top", "right"]].set_visible(False)
        axis.grid(axis="y", color="#dbe3ec", linewidth=0.85, alpha=0.95)
        axis.set_axisbelow(True)

    add_epoch_panel(
        events_axis,
        dates,
        rows_by_date,
        colors,
        field="main_provider_events",
        title="Regular main-agent decision rounds before the next compaction",
        ylabel="Decision rounds per epoch",
        step=25,
        seed=303,
    )
    message_step = 5 if max(
        integer(row, "persisted_user_messages_introduced") for row in filtered_rows
    ) <= 50 else 10
    add_epoch_panel(
        messages_axis,
        dates,
        rows_by_date,
        colors,
        field="persisted_user_messages_introduced",
        title="Persisted user messages introduced before the next compaction",
        ylabel="User messages per epoch",
        step=message_step,
        seed=313,
    )

    positions = np.arange(len(dates))
    messages_axis.set_xticks(
        positions,
        [
            f"{date_label(day)}\n{len(rows_by_date[day])} epochs\n"
            f"{sum(row['epoch_type'] == 'post_compaction' for row in rows_by_date[day])} post-comp."
            for day in dates
        ],
    )
    messages_axis.set_xlabel(
        "Date the observed epoch began "
        f"(session start or compaction, {args.timezone_label})"
    )

    figure.legend(
        handles=[
            Line2D(
                [0],
                [0],
                color="none",
                marker="o",
                markerfacecolor="#397f78",
                markeredgecolor="white",
                markersize=7,
                label="Initial session epoch",
            ),
            Line2D(
                [0],
                [0],
                color="none",
                marker="^",
                markerfacecolor="#397f78",
                markeredgecolor="white",
                markersize=8,
                label="Post-compaction epoch",
            ),
            Line2D(
                [0],
                [0],
                color="none",
                marker="D",
                markerfacecolor=MEAN_COLOR,
                markeredgecolor="white",
                markersize=7,
                label="Mean",
            ),
            Line2D([0], [0], color=TEXT_COLOR, linewidth=2, label="Median"),
        ],
        loc="upper left",
        bbox_to_anchor=(0.073, 0.888),
        ncols=4,
        frameon=False,
        borderaxespad=0,
        columnspacing=1.6,
    )

    initial_count = sum(row["epoch_type"] == "initial" for row in filtered_rows)
    post_count = len(filtered_rows) - initial_count
    message_count = sum(
        integer(row, "persisted_user_messages_introduced") for row in filtered_rows
    )
    empty_count = len(all_rows) - len(active_rows)
    figure.suptitle(
        "Context epochs split long sessions at compaction boundaries",
        x=0.055,
        y=0.975,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.055,
        0.939,
        (
            f"{len(filtered_rows):,} active epochs = {initial_count:,} session-initial + "
            f"{post_count:,} post-compaction • {message_count:,} persisted user messages retained"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    filter_text = (
        f" Epochs with >{args.max_user_messages} user messages are also omitted."
        if trimmed_rows
        else ""
    )
    figure.text(
        0.715,
        0.935,
        (
            "How to read this\n"
            "Each compaction with follow-up activity starts a new,\n"
            "equal-weight epoch. Empty terminal boundaries are omitted.\n"
            f"Linear axes show absolute count differences.{filter_text}"
        ),
        ha="left",
        va="top",
        fontsize=9.2,
        color=MUTED_COLOR,
        linespacing=1.35,
        bbox={
            "boxstyle": "round,pad=0.55",
            "facecolor": "#fff7ed",
            "edgecolor": "#fed7aa",
            "linewidth": 0.9,
        },
    )
    figure.text(
        0.055,
        0.018,
        (
            "A context epoch begins at session start or immediately after compaction and ends at the next compaction or observed session end. "
            "Boxes show Q1–Q3 with Tukey whiskers; points show every retained epoch.\n"
            "A decision round is one usage-bearing main-agent assistant response. Child calls, zero-token assistant records, and compaction-summary calls are excluded. "
            f"{empty_count} empty boundaries and {len(trimmed_rows)} threshold-filtered epochs are not plotted."
        ),
        ha="left",
        fontsize=8.9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(left=0.087, right=0.985, top=0.825, bottom=0.19)

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
