import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const WIDGET_CONFIG_FILE = "widget.json";
export const WIDGET_COMPONENT_IDS = [
	"ctx-manager",
	"doc-guardian",
	"pi-pet",
	"session-identity",
] as const;

export type WidgetComponentId = typeof WIDGET_COMPONENT_IDS[number];

export interface WidgetConfig {
	components: Record<WidgetComponentId, boolean>;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	if (!isObject(error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

export function createDefaultWidgetConfig(): WidgetConfig {
	return {
		components: {
			"ctx-manager": true,
			"doc-guardian": true,
			"pi-pet": true,
			"session-identity": true,
		},
	};
}

export function parseWidgetConfig(value: unknown, source = WIDGET_CONFIG_FILE): WidgetConfig {
	if (!isObject(value)) throw new Error(`Invalid widget config at ${source}: expected a JSON object`);

	const unknownRootKeys = Object.keys(value).filter((key) => key !== "components");
	if (unknownRootKeys.length > 0) {
		const label = unknownRootKeys.length === 1 ? "key" : "keys";
		throw new Error(`Invalid widget config at ${source}: unknown ${label}: ${unknownRootKeys.join(", ")}`);
	}

	const componentsValue = value.components ?? {};
	if (!isObject(componentsValue)) {
		throw new Error(`Invalid widget config at ${source}: components must be a JSON object`);
	}

	const knownIds = new Set<string>(WIDGET_COMPONENT_IDS);
	const unknownComponentIds = Object.keys(componentsValue).filter((id) => !knownIds.has(id));
	if (unknownComponentIds.length > 0) {
		const label = unknownComponentIds.length === 1 ? "component" : "components";
		throw new Error(`Invalid widget config at ${source}: unknown ${label}: ${unknownComponentIds.join(", ")}`);
	}

	const config = createDefaultWidgetConfig();
	for (const id of WIDGET_COMPONENT_IDS) {
		const enabled = componentsValue[id];
		if (enabled === undefined) continue;
		if (typeof enabled !== "boolean") {
			throw new Error(`Invalid widget config at ${source}: components.${id} must be a boolean`);
		}
		config.components[id] = enabled;
	}
	return config;
}

export function getWidgetConfigPath(agentDirectory = getAgentDir()): string {
	return join(agentDirectory, WIDGET_CONFIG_FILE);
}

export function loadWidgetConfig(path = getWidgetConfigPath()): WidgetConfig {
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") return createDefaultWidgetConfig();
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid widget config at ${path}: ${message}`, { cause: error });
	}
	return parseWidgetConfig(parsed, path);
}

export function saveWidgetConfig(config: WidgetConfig, path = getWidgetConfigPath()): void {
	const normalized = parseWidgetConfig(config, path);
	const directory = dirname(path);
	const temporaryPath = join(directory, `.${WIDGET_CONFIG_FILE}.${process.pid}.${randomUUID()}.tmp`);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		renameSync(temporaryPath, path);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}
