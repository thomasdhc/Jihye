import {
	getSettingsListTheme,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SettingItem,
	SettingsList,
	Text,
} from "@earendil-works/pi-tui";

import {
	createDefaultWidgetConfig,
	saveWidgetConfig,
	type WidgetComponentId,
	type WidgetConfig,
} from "./config.ts";

const COMPONENTS: ReadonlyArray<{ id: WidgetComponentId; label: string }> = [
	{ id: "pi-pet", label: "Pi pet" },
	{ id: "ctx-manager", label: "Context manager" },
	{ id: "session-identity", label: "Session identity" },
];

const COMPONENT_LABELS = new Map(COMPONENTS.map((component) => [component.id, component.label]));
const COMPONENT_IDS = new Set(COMPONENTS.map((component) => component.id));
const USAGE = "Usage: /widget [status | reset | <component> on|off]";

interface WidgetSettingsOptions {
	config: WidgetConfig;
	configPath: string;
	configWarning?: string;
}

type WidgetCommandAction =
	| { type: "menu" }
	| { type: "status" }
	| { type: "reset" }
	| { type: "set"; id: WidgetComponentId; enabled: boolean }
	| { type: "invalid" };

function cloneConfig(config: WidgetConfig): WidgetConfig {
	return { components: { ...config.components } };
}

export function parseWidgetCommand(args: string): WidgetCommandAction {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { type: "menu" };
	if (tokens.length === 1 && tokens[0] === "status") return { type: "status" };
	if (tokens.length === 1 && tokens[0] === "reset") return { type: "reset" };
	if (tokens.length !== 2 || !COMPONENT_IDS.has(tokens[0] as WidgetComponentId)) {
		return { type: "invalid" };
	}
	if (tokens[1] !== "on" && tokens[1] !== "off") return { type: "invalid" };
	return {
		type: "set",
		id: tokens[0] as WidgetComponentId,
		enabled: tokens[1] === "on",
	};
}

function formatStatus(config: WidgetConfig): string {
	return COMPONENTS
		.map(({ id, label }) => `${label}: ${config.components[id] ? "on" : "off"}`)
		.join("\n");
}

function saveSettings(
	config: WidgetConfig,
	configPath: string,
	ctx: ExtensionCommandContext,
): boolean {
	try {
		saveWidgetConfig(config, configPath);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Could not save widget settings: ${message}`, "error");
		return false;
	}
}

async function reloadExtensions(ctx: ExtensionCommandContext): Promise<void> {
	ctx.ui.notify("Widget settings saved — reloading extensions...", "info");
	await ctx.reload();
}

export function registerWidgetSettings(
	pi: ExtensionAPI,
	options: WidgetSettingsOptions,
): void {
	let config = cloneConfig(options.config);

	pi.registerCommand("widget", {
		description: "Configure companion widget components",
		handler: async (args, ctx) => {
			const action = parseWidgetCommand(args);
			if (action.type === "invalid") {
				ctx.ui.notify(USAGE, "warning");
				return;
			}
			if (action.type === "status") {
				ctx.ui.notify(formatStatus(config), "info");
				return;
			}
			if (action.type === "reset") {
				const nextConfig = createDefaultWidgetConfig();
				if (!saveSettings(nextConfig, options.configPath, ctx)) return;
				config = nextConfig;
				await reloadExtensions(ctx);
				return;
			}
			if (action.type === "set") {
				if (config.components[action.id] === action.enabled && !options.configWarning) {
					ctx.ui.notify(`${COMPONENT_LABELS.get(action.id)} is already ${action.enabled ? "on" : "off"}`, "info");
					return;
				}
				const nextConfig = cloneConfig(config);
				nextConfig.components[action.id] = action.enabled;
				if (!saveSettings(nextConfig, options.configPath, ctx)) return;
				config = nextConfig;
				await reloadExtensions(ctx);
				return;
			}

			if (ctx.mode !== "tui") {
				ctx.ui.notify(USAGE, "info");
				return;
			}

			const nextConfig = cloneConfig(config);
			let changed = options.configWarning !== undefined;
			await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
				const container = new Container();
				container.addChild(new Text(theme.fg("accent", theme.bold("Widget components")), 1, 1));
				if (options.configWarning) {
					container.addChild(new Text(theme.fg("warning", options.configWarning), 1, 0));
				}

				const items: SettingItem[] = COMPONENTS.map(({ id, label }) => ({
					id,
					label,
					currentValue: nextConfig.components[id] ? "on" : "off",
					values: ["on", "off"],
				}));
				const settings = new SettingsList(
					items,
					items.length + 2,
					getSettingsListTheme(),
					(id, value) => {
						const componentId = id as WidgetComponentId;
						const enabled = value === "on";
						if (nextConfig.components[componentId] !== enabled) changed = true;
						nextConfig.components[componentId] = enabled;
					},
					() => done(undefined),
				);
				container.addChild(settings);
				return {
					render: (width) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data) => settings.handleInput?.(data),
				};
			});

			if (!changed || !saveSettings(nextConfig, options.configPath, ctx)) return;
			config = nextConfig;
			await reloadExtensions(ctx);
			return;
		},
	});
}
