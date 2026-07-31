#!/usr/bin/env python3
"""
Extract user/assistant exchange pairs from a pi session JSONL file.
Walks the active branch (leaf → root) and returns clean text pairs.

Usage:
    python3 extract_pairs.py [session_file]
    python3 extract_pairs.py          # auto-discover most recent session for cwd

Output: JSON list of {idx, role, text, id, timestamp}
"""

import json
import os
import sys
from pathlib import Path


def find_session_file(cwd: str) -> Path | None:
    sessions_root = Path.home() / ".pi" / "agent" / "sessions"
    # session dirs encode cwd as --home-otidhc-Workspace-lada--
    encoded = cwd.lstrip("/").replace("/", "-")
    session_dir = sessions_root / f"--{encoded}--"
    if not session_dir.exists():
        return None
    files = sorted(session_dir.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True)
    return files[0] if files else None


def extract_text(content) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block["text"])
        return "\n".join(parts).strip()
    return ""


def parse_session(path: Path) -> list[dict]:
    entries = {}
    leaf_id = None

    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            if entry.get("type") == "session":
                continue
            eid = entry.get("id")
            if eid:
                entries[eid] = entry
                leaf_id = eid  # last entry is the leaf

    if not leaf_id:
        return []

    # walk from leaf to root, collect branch path
    branch_ids = []
    current = leaf_id
    while current:
        branch_ids.append(current)
        entry = entries.get(current, {})
        current = entry.get("parentId")
    branch_ids.reverse()  # root → leaf order

    # extract user/assistant message pairs
    pairs = []
    idx = 0
    for eid in branch_ids:
        entry = entries.get(eid, {})
        if entry.get("type") != "message":
            continue
        msg = entry.get("message", {})
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        text = extract_text(msg.get("content", ""))
        if not text:
            continue
        pairs.append({
            "idx":       idx,
            "role":      role,
            "text":      text,
            "id":        eid,
            "timestamp": entry.get("timestamp", ""),
        })
        idx += 1

    return pairs


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        cwd = os.getcwd()
        path = find_session_file(cwd)
        if not path:
            print(json.dumps({"error": f"No session found for cwd: {cwd}"}))
            sys.exit(1)

    pairs = parse_session(path)
    print(json.dumps({"session_file": str(path), "total_exchanges": len(pairs), "pairs": pairs}, indent=2))


if __name__ == "__main__":
    main()
