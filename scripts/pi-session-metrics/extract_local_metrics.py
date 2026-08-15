#!/usr/bin/env python3
"""Derive content-free plotting CSVs from local Pi session metadata."""

from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo


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
        help="directory in which to write the four derived CSV files",
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


def usage_values(value: Any) -> tuple[int, int]:
    """Return cache-inclusive total tokens and cache-read tokens."""
    usage = value if isinstance(value, dict) else {}

    def number(field: str) -> int:
        raw = usage.get(field, 0)
        return int(raw) if isinstance(raw, (int, float)) else 0

    total = number("totalTokens")
    if total <= 0:
        total = sum(number(field) for field in ("input", "output", "cacheRead", "cacheWrite"))
    return total, number("cacheRead")


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


def walk_results(results: Iterable[Any]) -> Iterable[dict[str, Any]]:
    """Yield top-level and recursively nested subagent results."""
    for result in results:
        if not isinstance(result, dict):
            continue
        yield result
        yield from walk_results(nested_results(result))


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
    daily: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"persisted_user_turns": 0, "compactions": 0}
    )
    sessions_read = 0
    sessions_excluded = 0
    branched_sessions = 0

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
        epoch = {
            "start_date": timestamp_date(header, timezone),
            "epoch_type": "initial",
            "persisted_user_messages_introduced": 0,
            "main_provider_events": 0,
        }
        call_dates: dict[str, str] = {}

        for entry in branch:
            entry_type = entry.get("type")
            day = timestamp_date(entry, timezone)
            if entry_type == "compaction":
                epoch_rows.append(epoch)
                epoch = {
                    "start_date": day,
                    "epoch_type": "post_compaction",
                    "persisted_user_messages_introduced": 0,
                    "main_provider_events": 0,
                }
                daily[(session_id, day)]["compactions"] += 1
                continue
            if entry_type != "message":
                continue
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            if role == "user":
                epoch["persisted_user_messages_introduced"] += 1
                daily[(session_id, day)]["persisted_user_turns"] += 1
                continue
            if role == "assistant":
                calls = tool_calls(message)
                subagent_calls = 0
                for call in calls:
                    call_id = call.get("id")
                    if isinstance(call_id, str):
                        call_dates[call_id] = day
                    if call.get("name") == "subagent":
                        subagent_calls += 1
                total_tokens, cache_read = usage_values(message.get("usage"))
                if total_tokens > 0:
                    epoch["main_provider_events"] += 1
                    main_rows.append(
                        {
                            "date": day,
                            "total_tokens": total_tokens,
                            "cacheRead": cache_read,
                            "used_subagents": subagent_calls,
                        }
                    )
                continue
            if role != "toolResult" or message.get("toolName") != "subagent":
                continue
            result_day = call_dates.get(str(message.get("toolCallId")), day)
            details = message.get("details")
            results = details.get("results") if isinstance(details, dict) else None
            for result in walk_results(results if isinstance(results, list) else []):
                total_tokens, cache_read = usage_values(result.get("usage"))
                child_rows.append(
                    {
                        "date": result_day,
                        "total_tokens": total_tokens,
                        "cacheRead": cache_read,
                    }
                )

        epoch_rows.append(epoch)

    main_rows = filter_rows(main_rows, "date", args.start_date, args.end_date)
    child_rows = filter_rows(child_rows, "date", args.start_date, args.end_date)
    epoch_rows = filter_rows(epoch_rows, "start_date", args.start_date, args.end_date)
    daily_rows = filter_rows(
        (
            {
                "session_id": session_id,
                "date": day,
                "persisted_user_turns": values["persisted_user_turns"],
                "compactions": values["compactions"],
            }
            for (session_id, day), values in daily.items()
        ),
        "date",
        args.start_date,
        args.end_date,
    )

    main_rows.sort(key=lambda row: row["date"])
    child_rows.sort(key=lambda row: row["date"])
    epoch_rows.sort(key=lambda row: row["start_date"])
    daily_rows.sort(key=lambda row: (row["session_id"], row["date"]))

    counts = {
        "main_agent_turn_usage.csv": write_csv(
            output_dir / "main_agent_turn_usage.csv",
            ["date", "total_tokens", "cacheRead", "used_subagents"],
            main_rows,
        ),
        "subagent_run_usage.csv": write_csv(
            output_dir / "subagent_run_usage.csv",
            ["date", "total_tokens", "cacheRead"],
            child_rows,
        ),
        "session_daily_structure.csv": write_csv(
            output_dir / "session_daily_structure.csv",
            ["session_id", "date", "persisted_user_turns", "compactions"],
            daily_rows,
        ),
        "context_epoch_usage.csv": write_csv(
            output_dir / "context_epoch_usage.csv",
            [
                "start_date",
                "epoch_type",
                "persisted_user_messages_introduced",
                "main_provider_events",
            ],
            epoch_rows,
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
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
