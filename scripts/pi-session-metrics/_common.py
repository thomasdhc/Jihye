"""Shared, standard-library helpers for Pi session metric plots."""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path
from typing import Iterable


def load_csv(path: Path, required_columns: Iterable[str]) -> list[dict[str, str]]:
    """Load a CSV and fail with a concise schema error when columns are missing."""
    try:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = set(reader.fieldnames or [])
            missing = sorted(set(required_columns) - columns)
            if missing:
                raise ValueError(
                    f"{path} is missing required columns: {', '.join(missing)}"
                )
            return list(reader)
    except OSError as error:
        raise ValueError(f"Could not read {path}: {error}") from error


def integer(row: dict[str, str], field: str) -> int:
    """Read one integer field with a useful error message."""
    value = row.get(field)
    try:
        return int(value or 0)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Invalid integer for {field}: {value!r}") from error


def non_cache_tokens(row: dict[str, str]) -> int:
    """Return input + output + cache write as total minus cache reads."""
    value = integer(row, "total_tokens") - integer(row, "cacheRead")
    if value < 0:
        raise ValueError("cacheRead cannot exceed total_tokens")
    return value


def date_label(value: str) -> str:
    """Format an ISO date compactly while retaining unknown date strings."""
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return value
    return parsed.strftime("%b %d")


def ensure_parent(path: Path) -> None:
    path.expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
