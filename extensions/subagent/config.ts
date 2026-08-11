/**
 * Subagent configuration: package-relative paths, extension config, the tool
 * catalogue used to build a child pi invocation, and pi binary resolution.
 *
 * Data and path resolution only; imports `types.ts` and nothing else in this
 * extension. Every exported path derives from this file's own location so
 * local, Git, and npm package installs all work without workstation-specific
 * paths — moving the module moves the agent and extension directories with it.
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

/**
 * Read the optional workstation config. No file is the normal case and means
 * "no overrides"; unreadable or malformed content throws, because silently
 * discarding settings the user did write is worse than failing to start.
 */
export function loadConfig(configPath: string = CONFIG_PATH): ExtensionConfig {
	let content: string;
	try {
		content = fs.readFileSync(configPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(content) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON at ${configPath}: ${message}`, { cause: error });
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`Invalid subagent config at ${configPath}: expected a JSON object`);
	}
	const config = parsed as ExtensionConfig;
	if (config.enableAlternateProviders !== undefined && typeof config.enableAlternateProviders !== "boolean") {
		throw new Error(`Invalid subagent config at ${configPath}: enableAlternateProviders must be a boolean`);
	}
	return config;
}

// Tools pi registers natively; the runner allowlists these with no `--extension`.
export const BUILTIN_TOOLS = new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]);

// Prompt infrastructure every child restores after `--no-extensions`.
export const JIHYE_SETUP_EXTENSION = path.join(EXTENSIONS_DIR, "jihye-setup", "index.ts");

// Tools that exist only once an extension is loaded into the child process,
// keyed by tool name so the runner can turn an agent's tool list into
// `--extension` paths.
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

/**
 * Single source of truth for what counts as a usable tool name, so discovery
 * (which rejects an agent declaring anything else) and the runner (which turns
 * the same names into argv) cannot disagree.
 */
export function isKnownTool(tool: string): boolean {
	return BUILTIN_TOOLS.has(tool) || tool in CUSTOM_TOOL_EXTENSIONS;
}

/**
 * Locate the pi executable for a child process. When the parent itself runs
 * from a JS entry point, re-run that exact entry under the current node binary
 * so the child is the same build as the parent; otherwise fall back to whatever
 * `pi` resolves to on PATH.
 */
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
