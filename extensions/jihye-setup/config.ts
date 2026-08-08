/**
 * Jihye setup configuration.
 *
 * Path discovery covers the common layout, so configuration only exists for
 * workstations that need to override it. Keeping it here leaves resolution
 * logic in `paths.ts` unaware of where its inputs come from.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const JIHYE_SETUP_CONFIG_FILE = "jihye-setup.json";

export interface JihyeSetupConfig {
	/** Workspace roots to use instead of discovery. */
	workspaceRoots?: string[];
	/** Show the session-start summary card. Default: true. */
	card: boolean;
}

const CONFIG_KEYS = new Set(["workspaceRoots", "card"]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	if (!isObject(error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

export function createDefaultJihyeSetupConfig(): JihyeSetupConfig {
	return { card: true };
}

export function parseJihyeSetupConfig(value: unknown, source = JIHYE_SETUP_CONFIG_FILE): JihyeSetupConfig {
	if (!isObject(value)) throw new Error(`Invalid jihye-setup config at ${source}: expected a JSON object`);

	const unknownKeys = Object.keys(value).filter((key) => !CONFIG_KEYS.has(key));
	if (unknownKeys.length > 0) {
		const label = unknownKeys.length === 1 ? "key" : "keys";
		throw new Error(`Invalid jihye-setup config at ${source}: unknown ${label}: ${unknownKeys.join(", ")}`);
	}

	const config = createDefaultJihyeSetupConfig();

	if (value.card !== undefined) {
		if (typeof value.card !== "boolean") {
			throw new Error(`Invalid jihye-setup config at ${source}: card must be a boolean`);
		}
		config.card = value.card;
	}

	if (value.workspaceRoots !== undefined) {
		if (!Array.isArray(value.workspaceRoots) || value.workspaceRoots.length === 0) {
			throw new Error(`Invalid jihye-setup config at ${source}: workspaceRoots must be a non-empty array`);
		}
		config.workspaceRoots = value.workspaceRoots.map((root) => {
			if (typeof root !== "string" || root.trim() === "") {
				throw new Error(`Invalid jihye-setup config at ${source}: workspaceRoots entries must be non-empty strings`);
			}
			if (!isAbsolute(root)) {
				throw new Error(`Invalid jihye-setup config at ${source}: workspaceRoots entry "${root}" must be an absolute path`);
			}
			return root;
		});
	}

	return config;
}

export function getJihyeSetupConfigPath(agentDirectory = getAgentDir()): string {
	return join(agentDirectory, JIHYE_SETUP_CONFIG_FILE);
}

/** Load configuration, treating an absent file as the defaults. */
export function loadJihyeSetupConfig(path = getJihyeSetupConfigPath()): JihyeSetupConfig {
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") return createDefaultJihyeSetupConfig();
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid jihye-setup config at ${path}: ${message}`, { cause: error });
	}
	return parseJihyeSetupConfig(parsed, path);
}
