#!/usr/bin/env python3
"""Plot one legible message-versus-decision-round context-epoch graph per date."""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from _common import date_label, integer, load_csv

REQUIRED_COLUMNS = {
    "start_date",
    "epoch_type",
    "persisted_user_messages_introduced",
    "main_provider_events",
}
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
INITIAL_COLOR = "#278f88"
POST_COMPACTION_COLOR = "#7a6fb1"
GUIDE_COLOR = "#94a3b8"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Write one message-versus-decision-round context-epoch PNG for each "
            "active start date in a content-free CSV."
        )
    )
    parser.add_argument("--epochs-csv", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def group_active_epochs_by_date(
    rows: list[dict[str, str]],
) -> tuple[dict[str, list[dict[str, str]]], int]:
    """Group active epochs, validate their coordinates, and count inactive rows."""
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    omitted = 0
    for row in rows:
        day = row["start_date"]
        try:
            parsed_day = date.fromisoformat(day)
        except ValueError as error:
            raise ValueError(f"Invalid ISO start_date: {day!r}") from error
        if parsed_day.isoformat() != day:
            raise ValueError(f"Invalid ISO start_date: {day!r}")
        messages = integer(row, "persisted_user_messages_introduced")
        rounds = integer(row, "main_provider_events")
        if messages < 0 or rounds < 0:
            raise ValueError("Context-epoch message and decision-round counts cannot be negative")
        if rounds == 0:
            omitted += 1
            continue
        grouped[day].append(row)
    return dict(sorted(grouped.items())), omitted


def log_ticks(limit: float) -> list[int]:
    ticks: list[int] = []
    power = 1
    while power <= limit:
        for multiplier in (1, 2, 5):
            value = multiplier * power
            if value <= limit:
                ticks.append(value)
        power *= 10
    return ticks or [1]


def remove_stale_date_outputs(output_dir: Path, active_dates: set[str]) -> None:
    """Remove only stale ISO-date PNGs from the plotter's dedicated directory."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.glob("*.png"):
        try:
            parsed = date.fromisoformat(path.stem)
        except ValueError:
            continue
        if parsed.isoformat() == path.stem and path.stem not in active_dates:
            path.unlink()


def add_ratio_guides(axis: Any, maximum_messages: int, maximum_rounds: int) -> None:
    import numpy as np

    xs = np.geomspace(0.82, maximum_messages * 1.35, 300)
    for ratio in (5, 10, 20):
        ys = ratio * xs
        visible = (ys >= 0.82) & (ys <= maximum_rounds * 1.35)
        if not visible.any():
            continue
        axis.plot(
            xs[visible],
            ys[visible],
            color=GUIDE_COLOR,
            linewidth=0.9,
            linestyle=(0, (4, 4)),
            alpha=0.72,
            zorder=1,
        )
        visible_x = xs[visible]
        visible_y = ys[visible]
        label_index = max(0, len(visible_x) - 10)
        axis.text(
            visible_x[label_index],
            visible_y[label_index] * 0.94,
            f"{ratio} rounds/message",
            fontsize=8.2,
            color="#64748b",
            ha="right",
            va="top",
            rotation=24,
        )


def plot_date(
    day: str,
    rows: list[dict[str, str]],
    output_dir: Path,
    timezone_label: str,
    omitted_rows: int,
) -> Path:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D
    from matplotlib.ticker import NullFormatter

    messages = np.array(
        [integer(row, "persisted_user_messages_introduced") for row in rows],
        dtype=float,
    )
    rounds = np.array(
        [integer(row, "main_provider_events") for row in rows], dtype=float
    )
    initial = np.array([row["epoch_type"] == "initial" for row in rows], dtype=bool)
    post_compaction = ~initial
    maximum_messages = int(messages.max())
    maximum_rounds = int(rounds.max())
    plotted_messages = np.where(messages == 0, 0.55, messages)
    x_limit = max(2.3, max(maximum_messages, 1) * 1.35)
    y_limit = max(2.3, maximum_rounds * 1.35)

    figure, axis = plt.subplots(figsize=(13.5, 8.6))
    figure.patch.set_facecolor(BACKGROUND)
    axis.set_facecolor("white")
    axis.spines[["top", "right"]].set_visible(False)
    axis.set_xscale("log")
    axis.set_yscale("log")
    axis.set_xlim(0.48, x_limit)
    axis.set_ylim(0.82, y_limit)
    x_ticks = log_ticks(x_limit)
    y_ticks = log_ticks(y_limit)
    axis.set_xticks([0.55, *x_ticks], ["0", *[str(value) for value in x_ticks]])
    axis.set_yticks(y_ticks, [str(value) for value in y_ticks])
    axis.xaxis.set_minor_formatter(NullFormatter())
    axis.yaxis.set_minor_formatter(NullFormatter())
    axis.grid(color="#dbe3ec", linewidth=0.85, alpha=0.95)
    axis.set_axisbelow(True)
    if maximum_messages > 0:
        add_ratio_guides(axis, maximum_messages, maximum_rounds)

    rng = np.random.default_rng(sum(day.encode("utf-8")))
    jittered_messages = plotted_messages * np.exp(
        rng.normal(0, 0.018, size=len(messages))
    )
    jittered_rounds = rounds * np.exp(rng.normal(0, 0.018, size=len(rounds)))
    if initial.any():
        axis.scatter(
            jittered_messages[initial],
            jittered_rounds[initial],
            marker="o",
            s=72,
            color=INITIAL_COLOR,
            edgecolors="white",
            linewidths=0.8,
            alpha=0.82,
            zorder=3,
        )
    if post_compaction.any():
        axis.scatter(
            jittered_messages[post_compaction],
            jittered_rounds[post_compaction],
            marker="^",
            s=92,
            color=POST_COMPACTION_COLOR,
            edgecolors="white",
            linewidths=0.85,
            alpha=0.84,
            zorder=4,
        )

    duplicate_counts: dict[tuple[int, int], int] = defaultdict(int)
    for message_count, round_count in zip(messages, rounds, strict=True):
        duplicate_counts[(int(message_count), int(round_count))] += 1
    for (message_count, round_count), count in duplicate_counts.items():
        if count < 2:
            continue
        plotted_message_count = 0.55 if message_count == 0 else message_count
        axis.annotate(
            f"×{count}",
            (plotted_message_count, round_count),
            xytext=(7, 7),
            textcoords="offset points",
            fontsize=8.2,
            color=TEXT_COLOR,
            fontweight="bold",
            zorder=6,
        )

    axis.set_xlabel("Persisted user messages introduced per epoch (log scale above zero)")
    axis.set_ylabel("Main-agent decision rounds per epoch (log scale)")
    axis.set_title(
        f"{date_label(day)} context epochs — messages versus decision rounds",
        loc="left",
        fontsize=17,
        fontweight="bold",
        color=TEXT_COLOR,
        pad=16,
    )
    aggregate_ratio = (
        f"{rounds.sum() / messages.sum():.1f} rounds/message"
        if messages.sum()
        else "rounds/message undefined (zero messages)"
    )
    figure.text(
        0.072,
        0.913,
        (
            f"{len(rows)} active epochs • {int(initial.sum())} initial + "
            f"{int(post_compaction.sum())} post-compaction • "
            f"{int(messages.sum())} messages • {int(rounds.sum())} rounds • "
            f"{aggregate_ratio}"
        ),
        ha="left",
        fontsize=10.7,
        color="#4b5563",
    )
    axis.legend(
        handles=[
            Line2D(
                [0],
                [0],
                marker="o",
                color="none",
                markerfacecolor=INITIAL_COLOR,
                markeredgecolor="white",
                markersize=8,
                label="Initial session epoch",
            ),
            Line2D(
                [0],
                [0],
                marker="^",
                color="none",
                markerfacecolor=POST_COMPACTION_COLOR,
                markeredgecolor="white",
                markersize=9,
                label="Post-compaction epoch",
            ),
        ],
        loc="upper left",
        frameon=False,
    )
    omitted_text = (
        f" Across the full CSV, {omitted_rows} inactive epoch rows are omitted."
        if omitted_rows
        else ""
    )
    figure.text(
        0.072,
        0.028,
        (
            "Every point is one active context epoch. Small deterministic jitter separates exact overlaps; "
            "×N marks repeated exact message/round coordinates; active zero-message epochs use the 0 column.\n"
            f"Dates use {timezone_label}.{omitted_text}"
        ),
        ha="left",
        fontsize=8.9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(left=0.105, right=0.98, top=0.82, bottom=0.13)

    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{day}.png"
    figure.savefig(output, dpi=200, facecolor=figure.get_facecolor())
    plt.close(figure)
    return output


def plot(args: argparse.Namespace) -> list[Path]:
    rows = load_csv(args.epochs_csv, REQUIRED_COLUMNS)
    grouped, omitted_rows = group_active_epochs_by_date(rows)
    if not grouped:
        raise ValueError("No active context epochs remain")
    remove_stale_date_outputs(args.output_dir, set(grouped))
    return [
        plot_date(
            day,
            day_rows,
            args.output_dir,
            args.timezone_label,
            omitted_rows,
        )
        for day, day_rows in grouped.items()
    ]


def main() -> None:
    try:
        for output in plot(parse_args()):
            print(output)
    except ValueError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
