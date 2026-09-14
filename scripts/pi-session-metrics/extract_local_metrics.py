#!/usr/bin/env python3
"""Derive content-free plotting CSVs from local Pi session metadata."""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

RUNTIME_ENTRY_TYPE = "jihye-runtime"
RUNTIME_COLUMNS = ["jihye_version", "persona_profile", "pi_version"]
UNATTRIBUTED_RUNTIME = {column: "" for column in RUNTIME_COLUMNS}
USAGE_COLUMNS = ["total_tokens", "cacheRead", "cache_write", "output_tokens", "cost"]
TOOL_COUNTERS = ["calls", "results", "errors", "truncated"]
MAIN_COLUMNS = ["date", *USAGE_COLUMNS, "model", "subagent_calls", *RUNTIME_COLUMNS]
SUBAGENT_COLUMNS = [
    "date",
    "agent",
    "depth",
    *USAGE_COLUMNS,
    "failed",
    "duration_ms",
    "tool_calls",
    *RUNTIME_COLUMNS,
]
TOOL_COLUMNS = ["date", "tool", *TOOL_COUNTERS, *RUNTIME_COLUMNS]
DAILY_COLUMNS = [
    "session_id",
    "date",
    "persisted_user_turns",
    "compactions",
    *RUNTIME_COLUMNS,
]
EPOCH_COLUMNS = [
    "start_date",
    "epoch_type",
    "persisted_user_messages_introduced",
    "main_provider_events",
    *RUNTIME_COLUMNS,
]
TRUNCATION_MARKER = re.compile(r"\[(?:output\s+)?truncated\b|\[showing lines\b", re.IGNORECASE)


def iso_date(value: str) -> date:
    """Parse one ISO calendar date for argparse."""
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"expected an ISO date in YYYY-MM-DD form, got {value!r}"
        ) from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read local Pi JSONL sessions and write content-free CSV inputs for the "
            "Pi session metric plotters."
        )
    )
    parser.add_argument(
        "--sessions-dir",
        type=Path,
        default=Path("~/.pi/agent/sessions"),
        help="Pi session root to scan recursively (default: ~/.pi/agent/sessions)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="directory in which to write the five derived CSV files",
    )
    parser.add_argument(
        "--timezone",
        default="America/New_York",
        help="IANA timezone used to derive calendar dates (default: America/New_York)",
    )
    parser.add_argument(
        "--start-date",
        type=iso_date,
        help="include observations on or after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        type=iso_date,
        help="exclude observations on or after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--exclude",
        type=Path,
        action="append",
        default=[],
        metavar="SESSION_JSONL",
        help="session file to exclude; repeat for multiple in-progress sessions",
    )
    parser.add_argument(
        "--exclude-current-session",
        action="store_true",
        help="exclude the session named by PI_SESSION_FILE",
    )
    args = parser.parse_args()
    if args.start_date and args.end_date and args.start_date >= args.end_date:
        parser.error("--start-date must be earlier than --end-date")
    if args.exclude_current_session:
        current_session = os.environ.get("PI_SESSION_FILE")
        if not current_session:
            parser.error("--exclude-current-session requires PI_SESSION_FILE")
        args.exclude.append(Path(current_session))
    return args


def timestamp_date(entry: dict[str, Any], timezone: ZoneInfo) -> str:
    """Return an entry's local calendar date without inspecting message text."""
    message = entry.get("message")
    if isinstance(message, dict):
        milliseconds = message.get("timestamp")
        if isinstance(milliseconds, (int, float)):
            return datetime.fromtimestamp(milliseconds / 1000, timezone).date().isoformat()
    value = entry.get("timestamp")
    if not isinstance(value, str):
        raise ValueError(f"Entry {entry.get('id', '<header>')} has no timestamp")
    return (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        .astimezone(timezone)
        .date()
        .isoformat()
    )


def finite_number(value: Any) -> float | None:
    """Return one finite numeric field, or None when it is absent or unusable."""
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def usage_values(value: Any) -> dict[str, Any]:
    """Return one usage record's cache-inclusive token split and cost.

    Cost is a scalar on subagent results and a per-component object on main-agent
    provider events, so an object cost contributes its total.
    """
    usage = value if isinstance(value, dict) else {}

    def number(field: str) -> int:
        raw = usage.get(field, 0)
        return int(raw) if isinstance(raw, (int, float)) else 0

    total = number("totalTokens")
    if total <= 0:
        total = sum(number(field) for field in ("input", "output", "cacheRead", "cacheWrite"))
    cost = usage.get("cost")
    cost = finite_number(cost.get("total") if isinstance(cost, dict) else cost)
    return {
        "total_tokens": total,
        "cacheRead": number("cacheRead"),
        "cache_write": number("cacheWrite"),
        "output_tokens": number("output"),
        "cost": cost if cost is not None else 0,
    }


def is_runtime_marker(entry: dict[str, Any]) -> bool:
    """Report whether one entry is a Jihye runtime marker written by jihye-setup."""
    return entry.get("type") == "custom" and entry.get("customType") == RUNTIME_ENTRY_TYPE


def runtime_values(entry: dict[str, Any]) -> dict[str, str]:
    """Return the runtime attribution carried by one marker entry's payload."""
    data = entry.get("data")
    payload = data if isinstance(data, dict) else {}

    def text(field: str) -> str:
        value = payload.get(field)
        return value if isinstance(value, str) else ""

    return {
        "jihye_version": text("jihyeVersion"),
        "persona_profile": text("profile"),
        "pi_version": text("piVersion"),
    }


def tool_name(value: Any) -> str:
    """Return one tool's metadata name, which is never message content."""
    return value if isinstance(value, str) and value.strip() else "unknown"


def result_truncated(message: dict[str, Any]) -> bool:
    """Report truncation from result metadata or markers without retaining any text."""
    details = message.get("details")
    if isinstance(details, dict) and details.get("truncated") is True:
        return True
    content = message.get("content")
    if isinstance(content, str):
        return TRUNCATION_MARKER.search(content) is not None
    if not isinstance(content, list):
        return False
    text = "\n".join(
        block["text"]
        for block in content
        if isinstance(block, dict)
        and block.get("type") == "text"
        and isinstance(block.get("text"), str)
    )
    return TRUNCATION_MARKER.search(text) is not None


def count_tool(
    tools: dict[tuple[str, ...], dict[str, int]],
    day: str,
    name: str,
    runtime: dict[str, str],
    field: str,
) -> None:
    """Count one tool call or result within the aggregated tool-usage grouping."""
    key = (day, name, *(runtime[column] for column in RUNTIME_COLUMNS))
    counters = tools.setdefault(key, {counter: 0 for counter in TOOL_COUNTERS})
    counters[field] += 1


def count_epoch_event(epoch: dict[str, Any], field: str, runtime: dict[str, str]) -> None:
    """Count one epoch event, attributing the epoch to the runtime at its first event."""
    if not epoch["persisted_user_messages_introduced"] and not epoch["main_provider_events"]:
        epoch.update(runtime)
    epoch[field] += 1


def active_branch(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Follow parent IDs from the latest entry to recover the active branch."""
    if not entries:
        return []
    by_id = {entry["id"]: entry for entry in entries if isinstance(entry.get("id"), str)}
    current: dict[str, Any] | None = entries[-1]
    branch: list[dict[str, Any]] = []
    seen: set[str] = set()
    while current is not None:
        entry_id = current.get("id")
        if not isinstance(entry_id, str) or entry_id in seen:
            raise ValueError("Session has a malformed or cyclic active branch")
        seen.add(entry_id)
        branch.append(current)
        parent_id = current.get("parentId")
        current = by_id.get(parent_id) if isinstance(parent_id, str) else None
    branch.reverse()
    return branch


def tool_calls(message: dict[str, Any]) -> list[dict[str, Any]]:
    """Return structured tool-call blocks, ignoring all text blocks."""
    content = message.get("content")
    if not isinstance(content, list):
        return []
    return [
        block
        for block in content
        if isinstance(block, dict) and block.get("type") == "toolCall"
    ]


def nested_results(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Return nested subagent results from one progress record."""
    progress = result.get("progress")
    if not isinstance(progress, dict):
        return []
    recent_tools = progress.get("recentTools")
    if not isinstance(recent_tools, list):
        return []
    children: list[dict[str, Any]] = []
    for tool in recent_tools:
        if not isinstance(tool, dict) or not isinstance(tool.get("children"), list):
            continue
        children.extend(child for child in tool["children"] if isinstance(child, dict))
    return children


def walk_results(results: Iterable[Any], depth: int = 1) -> Iterable[tuple[int, dict[str, Any]]]:
    """Yield top-level and recursively nested subagent results with their nesting depth."""
    for result in results:
        if not isinstance(result, dict):
            continue
        yield depth, result
        yield from walk_results(nested_results(result), depth + 1)


def subagent_outcome(result: dict[str, Any]) -> dict[str, Any]:
    """Return one subagent run's role name, failure flag, duration, and tool count."""
    progress = result.get("progress")
    progress = progress if isinstance(progress, dict) else {}
    agent = result.get("agent")
    error = progress.get("error")
    exit_code = finite_number(result.get("exitCode"))
    failed = (
        (exit_code is not None and exit_code != 0)
        or progress.get("status") == "failed"
        or (isinstance(error, str) and bool(error.strip()))
    )
    duration = finite_number(progress.get("durationMs"))
    tool_count = finite_number(progress.get("toolCount")) or 0
    recent_tools = progress.get("recentTools")
    if not tool_count and isinstance(recent_tools, list):
        tool_count = len(recent_tools)
    return {
        "agent": agent if isinstance(agent, str) and agent.strip() else "unknown",
        "failed": int(failed),
        "duration_ms": int(duration) if duration is not None else 0,
        "tool_calls": int(tool_count),
    }


def read_records(path: Path) -> list[dict[str, Any]]:
    """Read one JSONL session with a path-and-line error for malformed input."""
    records: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(record, dict):
                raise ValueError(f"Expected an object at {path}:{line_number}")
            records.append(record)
    return records


def in_date_range(value: str, start: date | None, end: date | None) -> bool:
    """Apply an inclusive start and exclusive end to one ISO date."""
    parsed = date.fromisoformat(value)
    return (start is None or parsed >= start) and (end is None or parsed < end)


def filter_rows(
    rows: Iterable[dict[str, Any]],
    date_field: str,
    start: date | None,
    end: date | None,
) -> list[dict[str, Any]]:
    """Filter metric rows by their schema's attribution date."""
    return [row for row in rows if in_date_range(str(row[date_field]), start, end)]


def write_csv(path: Path, columns: list[str], rows: Iterable[dict[str, Any]]) -> int:
    """Write one derived CSV and return its data-row count."""
    materialized = list(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(materialized)
    return len(materialized)


def main() -> None:
    args = parse_args()
    timezone = ZoneInfo(args.timezone)
    sessions_dir = args.sessions_dir.expanduser().resolve()
    if not sessions_dir.is_dir():
        raise SystemExit(f"Session directory does not exist: {sessions_dir}")
    output_dir = args.output_dir.expanduser()
    excluded = {path.expanduser().resolve() for path in args.exclude}
    session_files = sorted(sessions_dir.rglob("*.jsonl"))

    main_rows: list[dict[str, Any]] = []
    child_rows: list[dict[str, Any]] = []
    epoch_rows: list[dict[str, Any]] = []
    tools: dict[tuple[str, ...], dict[str, int]] = {}
    daily: dict[tuple[str, str], dict[str, Any]] = {}
    sessions_read = 0
    sessions_excluded = 0
    branched_sessions = 0
    calls_without_result = 0
    results_without_call = 0

    for path in session_files:
        if path.resolve() in excluded:
            sessions_excluded += 1
            continue
        records = read_records(path)
        if not records or records[0].get("type") != "session":
            raise ValueError(f"Not a Pi session: {path}")
        header = records[0]
        entries = records[1:]
        branch = active_branch(entries)
        sessions_read += 1

        child_counts: dict[str, int] = defaultdict(int)
        for entry in entries:
            parent_id = entry.get("parentId")
            if isinstance(parent_id, str):
                child_counts[parent_id] += 1
        branched_sessions += int(any(count > 1 for count in child_counts.values()))

        session_id = str(header.get("id") or path.stem)
        runtime = dict(UNATTRIBUTED_RUNTIME)
        epoch = {
            "start_date": timestamp_date(header, timezone),
            "epoch_type": "initial",
            "persisted_user_messages_introduced": 0,
            "main_provider_events": 0,
            **runtime,
        }
        call_dates: dict[str, str] = {}
        pending_calls: set[str] = set()

        for entry in branch:
            entry_type = entry.get("type")
            day = timestamp_date(entry, timezone)
            if is_runtime_marker(entry):
                runtime = runtime_values(entry)
                continue
            if entry_type == "compaction":
                epoch_rows.append(epoch)
                epoch = {
                    "start_date": day,
                    "epoch_type": "post_compaction",
                    "persisted_user_messages_introduced": 0,
                    "main_provider_events": 0,
                    **runtime,
                }
                counts = daily.setdefault(
                    (session_id, day),
                    {"persisted_user_turns": 0, "compactions": 0, **runtime},
                )
                counts["compactions"] += 1
                continue
            if entry_type != "message":
                continue
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            if role == "user":
                count_epoch_event(epoch, "persisted_user_messages_introduced", runtime)
                counts = daily.setdefault(
                    (session_id, day),
                    {"persisted_user_turns": 0, "compactions": 0, **runtime},
                )
                counts["persisted_user_turns"] += 1
                continue
            if role == "assistant":
                subagent_calls = 0
                for call in tool_calls(message):
                    call_id = call.get("id")
                    if isinstance(call_id, str):
                        call_dates[call_id] = day
                        pending_calls.add(call_id)
                    if call.get("name") == "subagent":
                        subagent_calls += 1
                    count_tool(tools, day, tool_name(call.get("name")), runtime, "calls")
                usage = usage_values(message.get("usage"))
                if usage["total_tokens"] > 0:
                    count_epoch_event(epoch, "main_provider_events", runtime)
                    model = message.get("model")
                    main_rows.append(
                        {
                            "date": day,
                            **usage,
                            "model": model if isinstance(model, str) else "",
                            "subagent_calls": subagent_calls,
                            **runtime,
                        }
                    )
                continue
            if role != "toolResult":
                continue
            call_id = message.get("toolCallId")
            call_day = call_dates.get(call_id) if isinstance(call_id, str) else None
            if call_day is None:
                results_without_call += 1
            elif isinstance(call_id, str):
                pending_calls.discard(call_id)
            result_day = call_day or day
            name = tool_name(message.get("toolName"))
            count_tool(tools, result_day, name, runtime, "results")
            if message.get("isError") is True:
                count_tool(tools, result_day, name, runtime, "errors")
            if result_truncated(message):
                count_tool(tools, result_day, name, runtime, "truncated")
            if name != "subagent":
                continue
            details = message.get("details")
            results = details.get("results") if isinstance(details, dict) else None
            for depth, result in walk_results(results if isinstance(results, list) else []):
                child_rows.append(
                    {
                        "date": result_day,
                        "depth": depth,
                        **subagent_outcome(result),
                        **usage_values(result.get("usage")),
                        **runtime,
                    }
                )

        epoch_rows.append(epoch)
        calls_without_result += len(pending_calls)

    main_rows = filter_rows(main_rows, "date", args.start_date, args.end_date)
    child_rows = filter_rows(child_rows, "date", args.start_date, args.end_date)
    epoch_rows = filter_rows(epoch_rows, "start_date", args.start_date, args.end_date)
    daily_rows = filter_rows(
        (
            {"session_id": session_id, "date": day, **values}
            for (session_id, day), values in daily.items()
        ),
        "date",
        args.start_date,
        args.end_date,
    )
    tool_rows = filter_rows(
        (
            {
                "date": day,
                "tool": name,
                **counters,
                **dict(zip(RUNTIME_COLUMNS, attribution)),
            }
            for (day, name, *attribution), counters in tools.items()
        ),
        "date",
        args.start_date,
        args.end_date,
    )

    main_rows.sort(key=lambda row: row["date"])
    child_rows.sort(key=lambda row: row["date"])
    epoch_rows.sort(key=lambda row: row["start_date"])
    daily_rows.sort(key=lambda row: (row["session_id"], row["date"]))
    tool_rows.sort(key=lambda row: (row["date"], row["tool"]))

    counts = {
        "main_agent_turn_usage.csv": write_csv(
            output_dir / "main_agent_turn_usage.csv", MAIN_COLUMNS, main_rows
        ),
        "subagent_run_usage.csv": write_csv(
            output_dir / "subagent_run_usage.csv", SUBAGENT_COLUMNS, child_rows
        ),
        "tool_usage.csv": write_csv(output_dir / "tool_usage.csv", TOOL_COLUMNS, tool_rows),
        "session_daily_structure.csv": write_csv(
            output_dir / "session_daily_structure.csv", DAILY_COLUMNS, daily_rows
        ),
        "context_epoch_usage.csv": write_csv(
            output_dir / "context_epoch_usage.csv", EPOCH_COLUMNS, epoch_rows
        ),
    }
    print(
        json.dumps(
            {
                "sessions_read": sessions_read,
                "sessions_excluded": sessions_excluded,
                "branched_sessions": branched_sessions,
                "timezone": args.timezone,
                "start_date": args.start_date.isoformat() if args.start_date else None,
                "end_date_exclusive": args.end_date.isoformat() if args.end_date else None,
                "rows": counts,
                "data_quality": {
                    "tool_calls_without_result": calls_without_result,
                    "tool_results_without_call": results_without_call,
                },
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
