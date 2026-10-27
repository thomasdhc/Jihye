/**
 * Web-search backend configuration: which provider `web_search` talks to.
 *
 * Pure configuration module; imports nothing from Jihye, so the web-search
 * extension and the subagent tool wiring read the same decision without
 * depending on each other's logic.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_SEARCH_BACKENDS = ["serper", "mcp"] as const;
export type WebSearchBackend = (typeof WEB_SEARCH_BACKENDS)[number];

export interface WebSearchConfig {
	/** Search provider. Absent means the Serper backend, matching pre-config behavior. */
	backend?: WebSearchBackend;
	/** Callable MCP tool name used when the backend is "mcp". */
	mcpTool?: string;
}

const EXT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const WEB_SEARCH_CONFIG_PATH = path.join(EXT_DIR, "config.json");

/**
 * Read the optional workstation config. No file is the normal case and means
 * the Serper backend; unreadable or malformed content throws, because
 * silently discarding settings the user did write is worse than failing to
 * start. Read once at extension load; a change requires /reload.
 */
export function loadWebSearchConfig(configPath: string = WEB_SEARCH_CONFIG_PATH): WebSearchConfig {
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
		throw new Error(`Invalid web-search config at ${configPath}: expected a JSON object`);
	}
	const config = parsed as WebSearchConfig;
	if (config.backend !== undefined && !WEB_SEARCH_BACKENDS.includes(config.backend)) {
		throw new Error(
			`Invalid web-search config at ${configPath}: backend must be one of ${WEB_SEARCH_BACKENDS.map((b) => `"${b}"`).join(", ")}`,
		);
	}
	if (config.backend === "mcp" && (typeof config.mcpTool !== "string" || config.mcpTool.trim() === "")) {
		throw new Error(
			`Invalid web-search config at ${configPath}: backend "mcp" requires a non-empty mcpTool, for example "mcp__<server>__<tool>"`,
		);
	}
	return config;
}

/** Whether the configured backend needs built-in MCP support to be loadable. */
export function requiresBuiltinMcp(config: WebSearchConfig): boolean {
	return config.backend === "mcp";
}

/** The workstation's current decision, for callers without their own config handle. */
export function defaultWebSearchRequiresMcp(configPath: string = WEB_SEARCH_CONFIG_PATH): boolean {
	return requiresBuiltinMcp(loadWebSearchConfig(configPath));
}
