/**
 * Agent discovery and registration.
 *
 * Reads agent definitions from disk and owns the in-process registry. Imports
 * `config.ts`, `models.ts`, and `types.ts`; never the runner or the renderer.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

import {
	DEFAULT_AGENT_THINKING,
	PACKAGE_AGENTS_DIR,
	PACKAGE_LOCAL_AGENTS_DIR,
	USER_AGENTS_DIR,
} from "./config.ts";
import { isModelTier, type ModelTier } from "./models.ts";
import type { AgentConfig } from "./types.ts";

let agents: AgentConfig[] = [];

// Read once at module load: a parent pins the allowlist before spawn, so it
// cannot change while this process lives. When set, every agent outside the
// list is dropped silently rather than reported as an error.
export const SUBAGENT_ALLOWLIST: string[] | undefined = (() => {
	const raw = process.env.PI_SUBAGENT_ALLOWED;
	if (!raw) return undefined;
	const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
	return list.length > 0 ? list : undefined;
})();

export function registerAgent(config: AgentConfig): void {
	if (SUBAGENT_ALLOWLIST && !SUBAGENT_ALLOWLIST.includes(config.name)) return;
	if (agents.find((a) => a.name === config.name)) {
		throw new Error(`Agent already registered: ${config.name}`);
	}
	agents.push(config);
}

export function unregisterAgent(name: string): void {
	agents = agents.filter((a) => a.name !== name);
}

/**
 * Replace the registry contents, e.g. after `index.ts` scans the agent
 * directories at startup. A setter exists because `agents` is a module-local
 * binding that importers cannot assign to; keep this the only way to swap it.
 */
export function setAgents(next: AgentConfig[]): void {
	agents = next;
}

// jiti gives each loading extension its own instance of this module, so the
// registry is only reachable across extensions through a global. This module is
// the sole owner of that global.
(globalThis as any).__pi_subagents = { registerAgent, unregisterAgent };

function loadAgentDirectory(directory: string): AgentConfig[] {
	const loadedAgents: AgentConfig[] = [];
	const seenNames = new Set<string>();
	if (!fs.existsSync(directory)) return loadedAgents;

	for (const entry of fs.readdirSync(directory).sort()) {
		if (!entry.endsWith(".md")) continue;
		const filePath = path.join(directory, entry);
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name) continue;
		if (seenNames.has(frontmatter.name)) {
			throw new Error(`Duplicate agent name "${frontmatter.name}" in ${directory}`);
		}
		seenNames.add(frontmatter.name);

		const tools = (frontmatter.tools || "")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		const rawSubagentAgents = (frontmatter as Record<string, string>).subagent_agents;
		const subagentAgents = rawSubagentAgents
			? rawSubagentAgents.split(",").map((t) => t.trim()).filter(Boolean)
			: undefined;
		const rawModelTier = (frontmatter as Record<string, string>).model_tier;
		if (rawModelTier && !isModelTier(rawModelTier)) {
			throw new Error(`Invalid model_tier "${rawModelTier}" for agent "${frontmatter.name}" in ${filePath}`);
		}
		loadedAgents.push({
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools,
			model: frontmatter.model || undefined,
			modelTier: rawModelTier as ModelTier | undefined,
			thinking: frontmatter.thinking || DEFAULT_AGENT_THINKING,
			systemPrompt: body,
			filePath,
			subagentAgents,
		});
	}
	return loadedAgents;
}

export function loadAgentsFromDirectories(directories: string[]): AgentConfig[] {
	const mergedAgents = new Map<string, AgentConfig>();
	for (const directory of directories) {
		for (const agent of loadAgentDirectory(directory)) {
			mergedAgents.set(agent.name, agent);
		}
	}
	return [...mergedAgents.values()];
}

export function getAgentDirectories(_cwd?: string): string[] {
	return [PACKAGE_AGENTS_DIR, USER_AGENTS_DIR, PACKAGE_LOCAL_AGENTS_DIR];
}

export function loadAgents(cwd?: string): AgentConfig[] {
	return loadAgentsFromDirectories(getAgentDirectories(cwd));
}
