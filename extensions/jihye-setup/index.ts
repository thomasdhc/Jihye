/**
 * Jihye Setup Extension
 *
 * Resolves where Jihye's package, personas, and workspace guidance live, then
 * hands those paths to the agent as facts. Guidance files previously asked the
 * agent to derive them with `readlink`/`dirname` at the start of a session,
 * which is deterministic work an extension can do once and get right.
 *
 * - `before_agent_start`: appends resolved paths to the system prompt.
 * - `session_start`: records runtime provenance and shows a TUI-only summary card, neither sent to the LLM.
 * - `session_tree`: reasserts provenance after navigating behind a runtime transition.
 * - `/jihye-setup`: reports resolution, guidance health, and legacy leftovers.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";

import { getJihyeSetupConfigPath, loadJihyeSetupConfig, type JihyeSetupConfig } from "./config.ts";
import {
	findLegacyExtensionCopies,
	formatFactBlock,
	type JihyeSetupFacts,
	resolveJihyeSetupFacts,
	resolvePackagePaths,
} from "./paths.ts";
import {
	createJihyeRuntimeMetadata,
	ensureJihyeRuntimeMarker,
	loadJihyePackageVersion,
	type JihyeRuntimeMetadata,
} from "./provenance.ts";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const CARD_ENTRY_TYPE = "jihye-setup-card";
const USAGE = "Usage: /jihye-setup [status]";

interface CardData {
	profile: string;
	jihyeVersion?: string;
	piVersion?: string;
	packageRoot: string;
	workspaceDirectory?: string;
	guidance: string[];
	warnings: string[];
}

/** Problems worth surfacing: everything else is reported as resolved paths. */
function collectWarnings(facts: JihyeSetupFacts, legacyExtensions: string[]): string[] {
	const warnings: string[] = [];

	if (facts.profile === "missing") {
		warnings.push(`No global context file at ${path.join(facts.agentDirectory, "AGENTS.md")}`);
	} else if (facts.profile === "unmanaged") {
		warnings.push(`Global context file is not a Jihye persona: ${path.join(facts.agentDirectory, "AGENTS.md")}`);
	}

	if (!facts.workspaceDirectory) {
		warnings.push("No managed workspace root above the working directory");
	}
	for (const missing of facts.missingLocalEnvironmentFiles) {
		warnings.push(`Missing local environment file: ${missing}`);
	}
	for (const link of facts.guidance) {
		if (!link.managed) warnings.push(`Guidance location is not linked into Jihye: ${link.path}`);
	}
	if (legacyExtensions.length > 0) {
		warnings.push(`Manual extension copies still installed: ${legacyExtensions.join(", ")}`);
	}

	return warnings;
}

/**
 * Load state is only knowable where the system prompt options are available,
 * so callers without them describe the link alone.
 */
function describeGuidance(facts: JihyeSetupFacts, includeLoadState: boolean): string[] {
	return facts.guidance.map((link) => {
		const target = link.managed && link.target ? path.basename(link.target) : "unmanaged";
		const loadState = includeLoadState ? (link.loaded ? " (loaded)" : " (not loaded)") : "";
		return `${link.path} → ${target}${loadState}`;
	});
}

function factsFor(ctx: ExtensionContext, config: JihyeSetupConfig, loadedContextFiles?: string[]): JihyeSetupFacts {
	return resolveJihyeSetupFacts({
		extensionDirectory: EXTENSION_DIR,
		agentDirectory: getAgentDir(),
		cwd: ctx.cwd,
		workspaceRoots: config.workspaceRoots,
		loadedContextFiles,
	});
}

function formatStatus(
	facts: JihyeSetupFacts,
	legacyExtensions: string[],
	configPath: string,
	jihyeVersion?: string,
): string {
	const lines = [
		`Profile: ${facts.profile}`,
		`Jihye version: ${jihyeVersion ?? "unresolved"}`,
		`Pi version: ${VERSION}`,
		`Package: ${facts.packageRoot}`,
		`Personas: ${facts.personasDirectory}`,
		`Workspace: ${facts.workspaceDirectory ?? "unresolved"}`,
		...describeGuidance(facts, true).map((entry) => `Guidance: ${entry}`),
		...facts.localEnvironmentFiles.map((file) => `Local environment: ${file}`),
		`Config: ${configPath}`,
	];
	const warnings = collectWarnings(facts, legacyExtensions);
	if (warnings.length > 0) lines.push("", ...warnings.map((warning) => `! ${warning}`));
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	const configPath = getJihyeSetupConfigPath();
	const packageRoot = resolvePackagePaths(EXTENSION_DIR).packageRoot;
	let configWarning: string | undefined;
	let versionWarning: string | undefined;
	let jihyeVersion: string | undefined;
	let config: JihyeSetupConfig;
	try {
		config = loadJihyeSetupConfig(configPath);
	} catch (error) {
		configWarning = error instanceof Error ? error.message : String(error);
		config = { card: true };
	}
	try {
		jihyeVersion = loadJihyePackageVersion(packageRoot);
	} catch (error) {
		versionWarning = error instanceof Error ? error.message : String(error);
	}

	pi.registerEntryRenderer(CARD_ENTRY_TYPE, (entry, { expanded }, theme) => {
		const data = entry.data as CardData;
		const container = new Container();
		container.addChild(new Text(theme.fg("accent", theme.bold("Jihye setup")), 1, 0));
		container.addChild(new Text(
			theme.fg("dim", `Jihye ${data.jihyeVersion ?? "unresolved"} · Pi ${data.piVersion ?? "unresolved"} · profile ${data.profile}`),
			1,
			0,
		));
		container.addChild(new Text(`workspace ${data.workspaceDirectory ?? "unresolved"}`, 1, 0));
		for (const warning of data.warnings) {
			container.addChild(new Text(theme.fg("warning", `! ${warning}`), 1, 0));
		}
		if (expanded) {
			container.addChild(new Text(theme.fg("dim", `package ${data.packageRoot}`), 1, 0));
			for (const entryLine of data.guidance) {
				container.addChild(new Text(theme.fg("dim", entryLine), 1, 0));
			}
		}
		return container;
	});

	const recordRuntime = (ctx: ExtensionContext): { facts: JihyeSetupFacts; runtime?: JihyeRuntimeMetadata } => {
		const facts = factsFor(ctx, config);
		if (!jihyeVersion) return { facts };
		const runtime = createJihyeRuntimeMetadata(jihyeVersion, facts.profile, VERSION);
		ensureJihyeRuntimeMarker(
			ctx.sessionManager.getBranch(),
			runtime,
			(customType, data) => pi.appendEntry(customType, data),
		);
		return { facts, runtime };
	};

	pi.on("session_start", async (_event, ctx) => {
		const { facts, runtime } = recordRuntime(ctx);
		if (!config.card || !ctx.hasUI) return;
		const warnings = collectWarnings(facts, findLegacyExtensionCopies(facts.agentDirectory, facts.packageRoot));
		if (versionWarning) warnings.unshift(versionWarning);
		if (configWarning) warnings.unshift(configWarning);
		const data: CardData = {
			profile: facts.profile,
			jihyeVersion: runtime?.jihyeVersion,
			piVersion: VERSION,
			packageRoot: facts.packageRoot,
			workspaceDirectory: facts.workspaceDirectory,
			guidance: describeGuidance(facts, false),
			warnings,
		};
		pi.appendEntry(CARD_ENTRY_TYPE, data);
	});

	pi.on("session_tree", async (_event, ctx) => {
		recordRuntime(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const facts = factsFor(ctx, config, event.systemPromptOptions.contextFiles?.map((file) => file.path));
		return { systemPrompt: `${event.systemPrompt}\n\n${formatFactBlock(facts)}` };
	});

	pi.registerCommand("jihye-setup", {
		description: "Report resolved Jihye paths and guidance health",
		handler: async (args, ctx) => {
			const action = args.trim();
			if (action !== "" && action !== "status") {
				ctx.ui.notify(USAGE, "warning");
				return;
			}
			const facts = factsFor(ctx, config, ctx.getSystemPromptOptions().contextFiles?.map((file) => file.path));
			const legacyExtensions = findLegacyExtensionCopies(facts.agentDirectory, facts.packageRoot);
			const report = formatStatus(facts, legacyExtensions, configPath, jihyeVersion);
			const warnings = [configWarning, versionWarning].filter((warning): warning is string => !!warning);
			ctx.ui.notify(warnings.length > 0 ? `${warnings.join("\n")}\n\n${report}` : report, warnings.length > 0 ? "warning" : "info");
		},
	});
}
