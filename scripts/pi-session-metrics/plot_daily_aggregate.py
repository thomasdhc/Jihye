#!/usr/bin/env python3
"""Plot daily Pi tokens, activity, and session structure."""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from _common import date_label, ensure_parent, integer, load_csv, non_cache_tokens

MAIN_COLUMNS = {"date", "total_tokens", "cacheRead", "subagent_calls"}
CHILD_COLUMNS = {"date", "total_tokens", "cacheRead"}
SESSION_COLUMNS = {
    "session_id",
    "date",
    "persisted_user_turns",
    "compactions",
}
MAIN_COLOR = "#278f88"
MAIN_LIGHT = "#94d4ca"
MAIN_DARK = "#176e69"
CHILD_COLOR = "#7a6fb1"
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Plot daily aggregate usage from content-free Pi metric CSVs."
    )
    parser.add_argument("--main-turns-csv", type=Path, required=True)
    parser.add_argument("--subagent-runs-csv", type=Path, required=True)
    parser.add_argument("--session-daily-csv", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def millions(value: float, _: int) -> str:
    return f"{value / 1_000_000:.0f}M"


def draw_token_panel(
    axis: Any,
    x: Any,
    main_values: Any,
    child_values: Any,
    *,
    title: str,
    ylabel: str,
) -> None:
    import matplotlib.pyplot as plt

    totals = main_values + child_values
    axis.bar(x, main_values, width=0.64, color=MAIN_COLOR)
    axis.bar(x, child_values, width=0.64, bottom=main_values, color=CHILD_COLOR)
    axis.yaxis.set_major_formatter(plt.FuncFormatter(millions))
    axis.set_ylabel(ylabel)
    axis.set_title(title, loc="left", fontsize=14.5, fontweight="bold")
    maximum = float(totals.max())
    axis.set_ylim(0, maximum * 1.20)
    for index, total in enumerate(totals):
        axis.text(
            index,
            total + maximum * 0.025,
            f"{total / 1_000_000:.1f}M",
            ha="center",
            va="bottom",
            fontsize=9,
            color=TEXT_COLOR,
            fontweight="bold",
        )


def group_sessions_by_first_turn_date(
    session_rows: list[dict[str, str]], dates: list[str]
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Group sessions by their first user-turn date without requiring every day to start one."""
    session_totals: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"dates_with_turns": [], "turns": 0, "compactions": 0}
    )
    for row in session_rows:
        session = session_totals[row["session_id"]]
        turns = integer(row, "persisted_user_turns")
        if turns:
            session["dates_with_turns"].append(row["date"])
        session["turns"] += turns
        session["compactions"] += integer(row, "compactions")

    sessions_by_day: dict[str, list[dict[str, Any]]] = {day: [] for day in dates}
    scoped_sessions: list[dict[str, Any]] = []
    for session in session_totals.values():
        if not session["dates_with_turns"]:
            continue
        first_date = min(session["dates_with_turns"])
        if first_date not in sessions_by_day:
            continue
        sessions_by_day[first_date].append(session)
        scoped_sessions.append(session)
    return sessions_by_day, scoped_sessions


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch

    parent_rows = load_csv(args.main_turns_csv, MAIN_COLUMNS)
    child_rows = load_csv(args.subagent_runs_csv, CHILD_COLUMNS)
    session_rows = load_csv(args.session_daily_csv, SESSION_COLUMNS)
    if not parent_rows:
        raise ValueError("The main-turn CSV has no observations")

    dates = sorted(
        {row["date"] for row in parent_rows}
        | {row["date"] for row in child_rows}
    )
    main_tokens: dict[str, int] = defaultdict(int)
    main_non_cache: dict[str, int] = defaultdict(int)
    child_tokens: dict[str, int] = defaultdict(int)
    child_non_cache: dict[str, int] = defaultdict(int)
    parent_turns: dict[str, int] = defaultdict(int)
    delegated_turns: dict[str, int] = defaultdict(int)
    child_runs: dict[str, int] = defaultdict(int)

    for row in parent_rows:
        day = row["date"]
        main_tokens[day] += integer(row, "total_tokens")
        main_non_cache[day] += non_cache_tokens(row)
        parent_turns[day] += 1
        delegated_turns[day] += int(integer(row, "subagent_calls") > 0)
    for row in child_rows:
        day = row["date"]
        child_tokens[day] += integer(row, "total_tokens")
        child_non_cache[day] += non_cache_tokens(row)
        child_runs[day] += 1

    main_values = np.array([main_tokens[day] for day in dates], dtype=float)
    main_non_cache_values = np.array(
        [main_non_cache[day] for day in dates], dtype=float
    )
    child_values = np.array([child_tokens[day] for day in dates], dtype=float)
    child_non_cache_values = np.array(
        [child_non_cache[day] for day in dates], dtype=float
    )
    parent_values = np.array([parent_turns[day] for day in dates], dtype=float)
    delegated_values = np.array([delegated_turns[day] for day in dates], dtype=float)
    nondelegated_values = parent_values - delegated_values
    run_values = np.array([child_runs[day] for day in dates], dtype=float)

    sessions_by_day, scoped_sessions = group_sessions_by_first_turn_date(
        session_rows, dates
    )
    if not scoped_sessions:
        raise ValueError("No session observations overlap the token-usage dates")
    turn_groups = [
        np.array([session["turns"] for session in sessions_by_day[day]], dtype=float)
        for day in dates
    ]
    compaction_groups = [
        np.array(
            [session["compactions"] for session in sessions_by_day[day]], dtype=int
        )
        for day in dates
    ]
    x = np.arange(len(dates))

    figure, (total_axis, non_cache_axis, activity_axis, session_axis) = plt.subplots(
        4,
        1,
        figsize=(15.5, 16),
        sharex=True,
        gridspec_kw={"height_ratios": [1.05, 1.05, 0.95, 1], "hspace": 0.31},
    )
    figure.patch.set_facecolor(BACKGROUND)
    for axis in (total_axis, non_cache_axis, activity_axis, session_axis):
        axis.set_facecolor("white")
        axis.spines[["top", "right"]].set_visible(False)
        axis.grid(axis="y", color="#dbe3ec", linewidth=0.85, alpha=0.95)
        axis.set_axisbelow(True)

    draw_token_panel(
        total_axis,
        x,
        main_values,
        child_values,
        title="Daily processed tokens by agent — including cache reads",
        ylabel="Processed tokens",
    )
    draw_token_panel(
        non_cache_axis,
        x,
        main_non_cache_values,
        child_non_cache_values,
        title="Daily non-cache tokens by agent — input + output + cache write",
        ylabel="Non-cache tokens",
    )

    activity_axis.bar(x, nondelegated_values, width=0.64, color=MAIN_LIGHT)
    activity_axis.bar(
        x,
        delegated_values,
        width=0.64,
        bottom=nondelegated_values,
        color=MAIN_DARK,
    )
    activity_axis.plot(
        x,
        run_values,
        color=CHILD_COLOR,
        linewidth=1.8,
        marker="^",
        markersize=7,
        markeredgecolor="white",
        markeredgewidth=0.8,
    )
    activity_axis.set_ylabel("Observation count")
    activity_axis.set_title(
        "Daily parent turns and individual subagent runs",
        loc="left",
        fontsize=14.5,
        fontweight="bold",
    )
    activity_maximum = max(float(parent_values.max()), float(run_values.max()), 1)
    activity_axis.set_ylim(0, activity_maximum * 1.24)
    for index, (turns, runs) in enumerate(zip(parent_values, run_values, strict=True)):
        activity_axis.text(
            index,
            turns + activity_maximum * 0.025,
            f"{int(turns)} turns",
            ha="center",
            va="bottom",
            fontsize=8.8,
            color=TEXT_COLOR,
        )
        activity_axis.annotate(
            f"{int(runs)}",
            (index, runs),
            xytext=(0, -14 if runs > turns * 0.7 else 8),
            textcoords="offset points",
            ha="center",
            va="top" if runs > turns * 0.7 else "bottom",
            fontsize=8.3,
            color=CHILD_COLOR,
            fontweight="bold",
        )

    for index, turn_group in enumerate(turn_groups):
        if not len(turn_group):
            continue
        boxes = session_axis.boxplot(
            [turn_group],
            positions=[index],
            widths=0.48,
            patch_artist=True,
            showfliers=False,
            medianprops={"color": TEXT_COLOR, "linewidth": 2},
            whiskerprops={"color": "#667085", "linewidth": 1.1},
            capprops={"color": "#667085", "linewidth": 1.1},
        )
        box = boxes["boxes"][0]
        box.set_facecolor(MAIN_LIGHT)
        box.set_alpha(0.35)
        box.set_edgecolor(MAIN_COLOR)
        box.set_linewidth(1.4)
    rng = np.random.default_rng(307)
    for index, (turn_group, compaction_group) in enumerate(
        zip(turn_groups, compaction_groups, strict=True)
    ):
        jitter = rng.normal(0, 0.065, size=len(turn_group))
        no_compaction = compaction_group == 0
        with_compaction = ~no_compaction
        if no_compaction.any():
            session_axis.scatter(
                index + jitter[no_compaction],
                turn_group[no_compaction],
                s=25,
                marker="o",
                color="#64748b",
                alpha=0.72,
                edgecolors="white",
                linewidths=0.5,
                zorder=3,
            )
        if with_compaction.any():
            session_axis.scatter(
                index + jitter[with_compaction],
                turn_group[with_compaction],
                s=34 + 20 * compaction_group[with_compaction],
                marker="^",
                color="#d97706",
                alpha=0.78,
                edgecolors="white",
                linewidths=0.6,
                zorder=4,
            )
    session_axis.set_yscale("log")
    session_maximum = max(
        float(group.max()) for group in turn_groups if len(group)
    )
    session_upper = max(80, session_maximum * 1.35)
    session_axis.set_ylim(0.8, session_upper)
    session_ticks = [1, 2, 5, 10, 20, 50, 100, 200, 500]
    session_ticks = [tick for tick in session_ticks if tick <= session_upper]
    session_axis.set_yticks(session_ticks, [str(tick) for tick in session_ticks])
    session_axis.set_ylabel("Turns in session (log scale)")
    session_axis.set_xlabel(
        f"Date of session's first in-range user turn ({args.timezone_label})"
    )
    session_axis.set_title(
        "Session structure — box = turns per session; triangle size = compaction count",
        loc="left",
        fontsize=14.5,
        fontweight="bold",
    )
    session_axis.set_xticks(
        x,
        [
            f"{date_label(day)}\n{len(sessions_by_day[day])} sessions · "
            f"{sum(session['compactions'] for session in sessions_by_day[day])} comp."
            for day in dates
        ],
    )

    figure.legend(
        handles=[
            Patch(facecolor=MAIN_COLOR, label="Main-agent tokens"),
            Patch(facecolor=CHILD_COLOR, label="Subagent tokens"),
            Patch(facecolor=MAIN_LIGHT, label="Parent turn without delegation"),
            Patch(facecolor=MAIN_DARK, label="Parent turn with delegation"),
            Line2D(
                [0],
                [0],
                color=CHILD_COLOR,
                marker="^",
                markeredgecolor="white",
                linewidth=1.8,
                markersize=7,
                label="Individual subagent runs",
            ),
            Line2D(
                [0],
                [0],
                color="none",
                marker="o",
                markerfacecolor="#64748b",
                markeredgecolor="white",
                markersize=6,
                label="Session without compaction",
            ),
            Line2D(
                [0],
                [0],
                color="none",
                marker="^",
                markerfacecolor="#d97706",
                markeredgecolor="white",
                markersize=8,
                label="Session with compaction",
            ),
        ],
        loc="upper left",
        bbox_to_anchor=(0.082, 0.915),
        ncols=4,
        frameon=False,
        borderaxespad=0,
        columnspacing=1.35,
    )

    persisted_turns = sum(session["turns"] for session in scoped_sessions)
    compactions = sum(session["compactions"] for session in scoped_sessions)
    figure.suptitle(
        "Daily aggregate Pi usage — tokens, activity, and session structure",
        x=0.055,
        y=0.98,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.055,
        0.948,
        (
            f"{len(parent_rows):,} parent turns • {len(child_rows):,} child runs • "
            f"{len(scoped_sessions):,} sessions • {persisted_turns:,} persisted session turns • "
            f"{compactions:,} compactions"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    figure.text(
        0.055,
        0.017,
        (
            "Token panels use independent vertical scales. Non-cache tokens are input + output + cache write. "
            "Session boxes group each session by its first supplied-scope turn; triangle size reflects compactions.\n"
            "Parent and child observation counts reflect the input CSV rows. Filter partial days and zero-token observations before plotting when required by the analysis."
        ),
        ha="left",
        fontsize=9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(left=0.085, right=0.985, top=0.81, bottom=0.075)

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
