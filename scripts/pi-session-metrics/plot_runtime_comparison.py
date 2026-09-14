#!/usr/bin/env python3
"""Compare usage shape across jihye versions, persona profiles, or Pi versions.

Four small multiples share one group axis so a runtime can be read across every
panel at once: tokens per main-agent turn, tool calls per turn, tool error rate,
and compactions per session. Groups are ordered by parsed version order rather
than alphabetically, so `0.10.0` follows `0.9.0`, and rows with an empty runtime
column are grouped as `unattributed` and sorted last.

The figure carries a permanent caveat: runtime groups are observational. They
are not randomised, the task mix differs between them, and a difference read
here is suggestive rather than causal. Sample sizes are printed on every panel
for the same reason, and groups under `--min-observations` are greyed and
labelled instead of being presented as equal evidence.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Any

from _common import ensure_parent, integer, load_csv

MAIN_COLUMNS = {"date", "total_tokens", "cacheRead", "jihye_version", "persona_profile", "pi_version"}
TOOL_COLUMNS = {"date", "tool", "calls", "errors", "jihye_version", "persona_profile", "pi_version"}
SESSION_COLUMNS = {
    "session_id",
    "date",
    "persisted_user_turns",
    "compactions",
    "jihye_version",
    "persona_profile",
    "pi_version",
}
GROUP_FIELDS = ("jihye_version", "persona_profile", "pi_version")
UNATTRIBUTED = "unattributed"
LOW_SAMPLE_COLOR = "#b6bec9"
TEXT_COLOR = "#172033"
MUTED_COLOR = "#5b6472"
BACKGROUND = "#f8fafc"
MEAN_COLOR = "#9a4d00"
SCALE_TICKS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]
SCALE_LABELS = ["1", "10", "100", "1K", "10K", "100K", "1M", "10M"]
CAVEAT = (
    "Caveat — these groups are not randomised and their task mix varies.\n"
    "Differences are suggestive, never causal; a small group is weak evidence."
)
DEFAULT_MIN_OBSERVATIONS = 10


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare Pi usage shape across runtime groups from content-free metric CSVs."
    )
    parser.add_argument("--main-turns-csv", type=Path, required=True)
    parser.add_argument("--tool-usage-csv", type=Path, required=True)
    parser.add_argument("--session-daily-csv", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--svg", type=Path)
    parser.add_argument(
        "--group-by",
        choices=GROUP_FIELDS,
        default="jihye_version",
        help="Runtime column that defines the compared groups.",
    )
    parser.add_argument(
        "--min-observations",
        type=int,
        default=DEFAULT_MIN_OBSERVATIONS,
        help=(
            "Main-agent turns a group needs before it is drawn as trustworthy "
            f"(default: {DEFAULT_MIN_OBSERVATIONS})."
        ),
    )
    parser.add_argument("--timezone-label", default="America/New_York")
    return parser.parse_args()


def group_label(row: dict[str, str], field: str) -> str:
    """Name the runtime group, keeping unattributed rows explicit."""
    return (row.get(field) or "").strip() or UNATTRIBUTED


def version_sort_key(label: str) -> tuple[int, tuple[int, ...], str]:
    """Sort parseable dotted versions numerically, then names, then unattributed."""
    if label == UNATTRIBUTED:
        return (2, (), label)
    parts = label.lstrip("v").split(".")
    if parts and all(part.isdigit() for part in parts):
        return (0, tuple(int(part) for part in parts), label)
    return (1, (), label)


def sessions_by_group(
    rows: list[dict[str, str]], field: str
) -> dict[str, list[int]]:
    """Total compactions per session, attributing each session to its busiest runtime."""
    sessions: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"compactions": 0, "turns_by_group": defaultdict(int), "rows": 0}
    )
    for row in rows:
        session = sessions[row["session_id"]]
        session["compactions"] += integer(row, "compactions")
        session["rows"] += 1
        session["turns_by_group"][group_label(row, field)] += (
            integer(row, "persisted_user_turns") + 1
        )

    grouped: dict[str, list[int]] = defaultdict(list)
    for session in sessions.values():
        turns_by_group: dict[str, int] = session["turns_by_group"]
        label = max(sorted(turns_by_group), key=lambda name: turns_by_group[name])
        grouped[label].append(session["compactions"])
    return grouped


def style_axis(axis: Any, title: str, ylabel: str) -> None:
    axis.set_facecolor("white")
    axis.spines[["top", "right"]].set_visible(False)
    axis.grid(axis="y", color="#dbe3ec", linewidth=0.85, alpha=0.95)
    axis.set_axisbelow(True)
    axis.set_ylabel(ylabel)
    axis.set_title(title, loc="left", fontsize=13.5, fontweight="bold", pad=9)


def plot(args: argparse.Namespace) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["svg.hashsalt"] = "jihye-pi-session-metrics"
    import matplotlib.pyplot as plt
    import numpy as np

    if args.min_observations < 1:
        raise ValueError("--min-observations must be positive")
    field = args.group_by
    main_rows = load_csv(args.main_turns_csv, MAIN_COLUMNS)
    tool_rows = load_csv(args.tool_usage_csv, TOOL_COLUMNS)
    session_rows = load_csv(args.session_daily_csv, SESSION_COLUMNS)
    if not main_rows:
        raise ValueError("The main-turn CSV has no observations")

    turn_tokens: dict[str, list[int]] = defaultdict(list)
    for row in main_rows:
        turn_tokens[group_label(row, field)].append(integer(row, "total_tokens"))
    tool_calls: dict[str, int] = defaultdict(int)
    tool_errors: dict[str, int] = defaultdict(int)
    for row in tool_rows:
        label = group_label(row, field)
        tool_calls[label] += integer(row, "calls")
        tool_errors[label] += integer(row, "errors")
    session_compactions = sessions_by_group(session_rows, field)

    groups = sorted(
        set(turn_tokens) | set(tool_calls) | set(session_compactions),
        key=version_sort_key,
    )
    if not groups:
        raise ValueError(f"No {field} values are present in the supplied CSVs")
    trusted = [len(turn_tokens.get(label, [])) >= args.min_observations for label in groups]
    x = np.arange(len(groups))
    colors = [
        plt.colormaps["viridis"](value) if keep else LOW_SAMPLE_COLOR
        for value, keep in zip(
            np.linspace(0.18, 0.82, len(groups)), trusted, strict=True
        )
    ]

    figure, axes = plt.subplots(
        2,
        2,
        figsize=(16.5, 11.4),
        gridspec_kw={"hspace": 0.42, "wspace": 0.20},
    )
    figure.patch.set_facecolor(BACKGROUND)
    token_axis, calls_axis, error_axis, compaction_axis = axes.flatten()

    style_axis(
        token_axis,
        "Tokens per main-agent turn",
        "Tokens per turn (log scale)",
    )
    token_axis.set_yscale("log")
    rng = np.random.default_rng(521)
    token_ceiling = 10.0
    for index, (label, color) in enumerate(zip(groups, colors, strict=True)):
        values = np.array(
            [value for value in turn_tokens.get(label, []) if value > 0], dtype=float
        )
        if not len(values):
            continue
        token_ceiling = max(token_ceiling, float(values.max()))
        boxes = token_axis.boxplot(
            [values],
            positions=[index],
            widths=0.46,
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
        token_axis.scatter(
            index + rng.normal(0, 0.07, size=len(values)),
            values,
            s=20,
            color=color,
            edgecolors="white",
            linewidths=0.3,
            alpha=0.65,
            zorder=3,
        )
        token_axis.scatter(
            index,
            values.mean(),
            marker="D",
            s=54,
            color=MEAN_COLOR,
            edgecolors="white",
            linewidths=0.7,
            zorder=4,
        )
    token_axis.set_ylim(top=token_ceiling * 6)
    token_axis.minorticks_off()
    lower, upper = token_axis.get_ylim()
    token_ticks = [
        (tick, label)
        for tick, label in zip(SCALE_TICKS, SCALE_LABELS, strict=True)
        if lower <= tick <= upper
    ]
    token_axis.set_yticks(
        [tick for tick, _ in token_ticks], [label for _, label in token_ticks]
    )
    for index, label in enumerate(groups):
        token_axis.text(
            index,
            0.965,
            f"n={len(turn_tokens.get(label, [])):,} turns",
            transform=token_axis.get_xaxis_transform(),
            ha="center",
            va="top",
            fontsize=8.8,
            color=MUTED_COLOR,
        )

    turns_per_group = np.array(
        [max(len(turn_tokens.get(label, [])), 0) for label in groups], dtype=float
    )
    calls_per_turn = np.array(
        [
            tool_calls.get(label, 0) / turns if turns else 0.0
            for label, turns in zip(groups, turns_per_group, strict=True)
        ]
    )
    style_axis(calls_axis, "Tool calls per main-agent turn", "Calls per turn")
    calls_axis.bar(x, calls_per_turn, width=0.6, color=colors, alpha=0.9)
    calls_ceiling = max(float(calls_per_turn.max()), 1.0)
    calls_axis.set_ylim(0, calls_ceiling * 1.28)
    for index, (label, value) in enumerate(zip(groups, calls_per_turn, strict=True)):
        calls_axis.text(
            index,
            value + calls_ceiling * 0.03,
            f"{value:.2f}\nn={tool_calls.get(label, 0):,} calls / "
            f"{int(turns_per_group[index]):,} turns",
            ha="center",
            va="bottom",
            fontsize=8.8,
            color=TEXT_COLOR,
            linespacing=1.3,
        )

    error_rates = np.array(
        [
            100.0 * tool_errors.get(label, 0) / tool_calls[label]
            if tool_calls.get(label)
            else 0.0
            for label in groups
        ]
    )
    style_axis(error_axis, "Tool error rate", "Errors per 100 tool calls")
    error_axis.bar(x, error_rates, width=0.6, color=colors, alpha=0.9)
    error_ceiling = max(float(error_rates.max()), 1.0)
    error_axis.set_ylim(0, error_ceiling * 1.28)
    for index, (label, value) in enumerate(zip(groups, error_rates, strict=True)):
        error_axis.text(
            index,
            value + error_ceiling * 0.03,
            f"{value:.2f}\nn={tool_calls.get(label, 0):,} calls",
            ha="center",
            va="bottom",
            fontsize=8.8,
            color=TEXT_COLOR,
            linespacing=1.3,
        )

    style_axis(compaction_axis, "Compactions per session", "Compactions per session")
    means = []
    for index, (label, color) in enumerate(zip(groups, colors, strict=True)):
        values = np.array(session_compactions.get(label, []), dtype=float)
        mean = float(values.mean()) if len(values) else 0.0
        means.append(mean)
        compaction_axis.bar(index, mean, width=0.6, color=color, alpha=0.9)
        if len(values):
            compaction_axis.scatter(
                index + rng.normal(0, 0.075, size=len(values)),
                values,
                s=22,
                color="#475569",
                edgecolors="white",
                linewidths=0.35,
                alpha=0.6,
                zorder=3,
            )
    compaction_ceiling = max(
        max(means, default=0.0),
        max(
            (max(values, default=0) for values in session_compactions.values()),
            default=0,
        ),
        1.0,
    )
    compaction_axis.set_ylim(0, compaction_ceiling * 1.32)
    for index, (label, mean) in enumerate(zip(groups, means, strict=True)):
        compaction_axis.text(
            index,
            compaction_ceiling * 1.04,
            f"{mean:.2f}\nn={len(session_compactions.get(label, [])):,} sessions",
            ha="center",
            va="bottom",
            fontsize=8.8,
            color=TEXT_COLOR,
            linespacing=1.3,
        )

    tick_labels = [
        f"{label}\nbelow --min-observations" if not keep else label
        for label, keep in zip(groups, trusted, strict=True)
    ]
    for axis in (token_axis, calls_axis, error_axis, compaction_axis):
        axis.set_xlim(-0.6, len(groups) - 0.4)
        axis.set_xticks(x, tick_labels, fontsize=9.5)

    low_groups = [label for label, keep in zip(groups, trusted, strict=True) if not keep]
    figure.suptitle(
        f"Runtime comparison across {field} values",
        x=0.055,
        y=0.962,
        ha="left",
        fontsize=20,
        fontweight="bold",
        color=TEXT_COLOR,
    )
    figure.text(
        0.055,
        0.918,
        (
            f"{len(groups)} groups • {len(main_rows):,} main turns • "
            f"{sum(tool_calls.values()):,} tool calls • "
            f"{sum(len(values) for values in session_compactions.values()):,} sessions • "
            f"dates in {args.timezone_label}"
        ),
        ha="left",
        fontsize=10.8,
        color="#4b5563",
    )
    figure.text(
        0.625,
        0.988,
        CAVEAT,
        ha="left",
        va="top",
        fontsize=10.5,
        color="#7c2d12",
        fontweight="bold",
        linespacing=1.4,
        bbox={
            "boxstyle": "round,pad=0.55",
            "facecolor": "#fff7ed",
            "edgecolor": "#fdba74",
            "linewidth": 1.1,
        },
    )
    low_text = (
        f" Greyed groups ({', '.join(low_groups)}) hold fewer than {args.min_observations} main turns and are shown for completeness only."
        if low_groups
        else ""
    )
    figure.text(
        0.055,
        0.018,
        (
            f"Groups come from the {field} column of each CSV; empty values are grouped as {UNATTRIBUTED}. "
            "Tool calls per turn and the error rate are group ratios, not per-turn distributions, because tool rows are per-date aggregates.\n"
            f"Each session is attributed to the runtime that carried most of its turns; sessions spanning a runtime change land in one group only.{low_text}"
        ),
        ha="left",
        fontsize=9,
        color=MUTED_COLOR,
    )
    figure.subplots_adjust(left=0.062, right=0.985, top=0.845, bottom=0.10)

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
