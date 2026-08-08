/**
 * Subagent configuration: package-relative paths, extension config, the tool
 * catalogue used to build a child pi invocation, and pi binary resolution.
 *
 * Paths are resolved relative to this file so local, Git, and npm package
 * installations all work without workstation-specific paths. This file must
 * stay in `extensions/subagent/` for those paths to keep resolving.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import type { ExtensionConfig } from "./types.ts";

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = path.dirname(EXT_DIR);
const PACKAGE_ROOT = path.dirname(EXTENSIONS_DIR);
export const PACKAGE_AGENTS_DIR = path.join(PACKAGE_ROOT, "personas", "subagents");
export const PACKAGE_LOCAL_AGENTS_DIR = path.join(PACKAGE_ROOT, ".pi", "agents");
export const USER_AGENTS_DIR = path.join(getAgentDir(), "agents");
const TOOLS_DIR = path.join(EXT_DIR, "tools");
const CONFIG_PATH = path.join(EXT_DIR, "config.json");
export const MODEL_PROFILES_PATH = path.join(EXT_DIR, "model-profiles.json");
export const DEFAULT_MAX_CONCURRENCY = 4;
export const DEFAULT_AGENT_THINKING = "medium";

export function loadConfig(): ExtensionConfig {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as ExtensionConfig;
		}
	} catch {}
	return {};
}

// Built-in tools that pi provides natively (no extension needed)
export const BUILTIN_TOOLS = new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]);

// Custom tools that require loading an extension into the subagent process.
// Resolve package-owned extensions relative to this file so local, Git, and npm
// package installations all work without workstation-specific paths.
export const BASH_GUARD_EXTENSION = path.join(EXTENSIONS_DIR, "bash-guard", "index.ts");
export const CUSTOM_TOOL_EXTENSIONS: Record<string, string> = {
	web_search: path.join(EXTENSIONS_DIR, "web-search", "index.ts"),
	web_fetch: path.join(EXTENSIONS_DIR, "web-fetch", "index.ts"),
	safe_bash: path.join(TOOLS_DIR, "safe-bash.ts"),
	// `subagent` is the tool this very extension registers. Listing it here lets
	// a parent agent grant it to a child agent — the child pi process loads this
	// same index.ts via `--extension`, sees its own subagent tool, and (if
	// PI_SUBAGENT_ALLOWED is set) only registers the allowlisted agents.
	subagent: path.join(EXT_DIR, "index.ts"),
};

// ── Pi Binary Resolution ──────────────────────────────────────────────

export function resolvePiBinary(): { command: string; baseArgs: string[] } {
	const entry = process.argv[1];
	if (entry) {
		try {
			const realEntry = fs.realpathSync(entry);
			if (/\.(?:mjs|cjs|js)$/i.test(realEntry)) {
				return { command: process.execPath, baseArgs: [realEntry] };
			}
		} catch {}
	}
	return { command: "pi", baseArgs: [] };
}
