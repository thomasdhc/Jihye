/**
 * Shared subagent types.
 *
 * Leaf module: describes the agent definitions, live progress, and results
 * exchanged between discovery, the runner, the renderer, and the tool wiring.
 */
import type { ModelTier } from "./models.ts";

export interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	/**
	 * Model pinned by agent frontmatter. Left undefined by the bundled
	 * definitions so the tier decides per provider at spawn time.
	 */
	model?: string;
	/** Capability tier used to select a model for the active provider. */
	modelTier?: ModelTier;
	thinking: string;
	systemPrompt: string;
	filePath: string;
	/**
	 * If this agent has the `subagent` tool, restrict which agents it may spawn.
	 * Passed to the child pi process via `PI_SUBAGENT_ALLOWED` so the child's
	 * subagents extension filters its own registry before exposing it to the LLM.
	 * `undefined` means no restriction (child sees every registered agent).
	 */
	subagentAgents?: string[];
}

/** Agent whose model has been resolved for the current parent session. */
export type ResolvedAgentConfig = AgentConfig & { model: string };

export interface ToolEvent {
	tool: string;
	args: string;
	/** Matches the producing tool_execution_start/update/end event. */
	toolCallId?: string;
	/**
	 * "running" while between tool_execution_start and tool_execution_end; flipped
	 * to "done" on end. We store every in-flight call in recentTools (keyed by
	 * toolCallId) rather than a single current-tool slot, because pi-agent-core
	 * dispatches a turn's tool calls in parallel via Promise.all — a single slot
	 * would let the second start overwrite the first.
	 */
	status: "running" | "done";
	/**
	 * Live progress of subagents spawned by this tool call. Populated only for
	 * `subagent` tool calls, from the `partialResult.details.results` payload of
	 * `tool_execution_update` events (and refreshed once more from the end
	 * event's final results). Recursive: each child's own progress may carry
	 * further children via its `recentTools[i].children`.
	 */
	children?: AgentResult[];
}

export interface AgentProgress {
	agent: string;
	status: "pending" | "running" | "completed" | "failed";
	task: string;
	/**
	 * Chronological log of tool calls — running and done interleaved. Entries are
	 * appended and then mutated in place; `render.ts` distinguishes them by
	 * `status`, so this list must never be reordered or filtered.
	 */
	recentTools: ToolEvent[];
	toolCount: number;
	tokens: number;
	durationMs: number;
	lastMessage: string;
	error?: string;
}

export interface AgentResult {
	agent: string;
	task: string;
	output: string;
	exitCode: number;
	progress: AgentProgress;
	model?: string;
	contextWindow?: number;
	usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number };
}

export interface Details {
	results: AgentResult[];
}

export interface ExtensionConfig {
	maxConcurrency?: number;
	/** Partial override of the bundled provider tier maps. */
	modelProfiles?: unknown;
}
