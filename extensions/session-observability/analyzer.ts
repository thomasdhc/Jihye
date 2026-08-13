import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import {
	JIHYE_RUNTIME_ENTRY_TYPE,
	parseJihyeRuntimeMetadata,
	type JihyeRuntimeMetadata,
} from "../jihye-setup/provenance.ts";
import type {
	AnalyzeSessionOptions,
	JihyeRuntimeSummary,
	JihyeTurnObservation,
	ModelUsageSummary,
	OperationalSignal,
	SessionObservation,
	SubagentSummary,
	ToolSummary,
	UsageSummary,
} from "./types.ts";

interface ToolCallRecord {
	id: string;
	name: string;
	args: unknown;
	runtime?: JihyeRuntimeMetadata;
}

interface ToolResultRecord {
	id: string;
	name: string;
	isError: boolean;
	isTruncated: boolean;
	usage?: unknown;
	details?: unknown;
	runtime?: JihyeRuntimeMetadata;
}

interface TurnRecord {
	entryId: string;
	runtime?: JihyeRuntimeMetadata;
	provider: string;
	model: string;
	usage: UsageSummary;
	toolCallIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createUsageSummary(): UsageSummary {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
}

function usageSummary(value: unknown): UsageSummary {
	const usage = isRecord(value) ? value : {};
	const input = finiteNumber(usage.input);
	const output = finiteNumber(usage.output);
	const cacheRead = finiteNumber(usage.cacheRead);
	const cacheWrite = finiteNumber(usage.cacheWrite);
	const declaredTotal = finiteNumber(usage.totalTokens);
	const costValue = isRecord(usage.cost) ? usage.cost.total : usage.cost;
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: declaredTotal || input + output + cacheRead + cacheWrite,
		cost: finiteNumber(costValue),
	};
}

function addUsage(target: UsageSummary, source: UsageSummary): void {
	target.input += source.input;
	target.output += source.output;
	target.cacheRead += source.cacheRead;
	target.cacheWrite += source.cacheWrite;
	target.totalTokens += source.totalTokens;
	target.cost += source.cost;
}

function combinedUsage(...summaries: UsageSummary[]): UsageSummary {
	const total = createUsageSummary();
	for (const summary of summaries) addUsage(total, summary);
	return total;
}

function runtimeKey(runtime: JihyeRuntimeMetadata | undefined): string {
	return runtime
		? `${runtime.schemaVersion}\u0000${runtime.jihyeVersion}\u0000${runtime.profile}\u0000${runtime.piVersion}`
		: "unknown";
}

function getOrCreateRuntime(
	runtimes: Map<string, JihyeRuntimeSummary>,
	runtime: JihyeRuntimeMetadata | undefined,
): JihyeRuntimeSummary {
	const key = runtimeKey(runtime);
	let summary = runtimes.get(key);
	if (!summary) {
		summary = {
			runtime,
			userPrompts: 0,
			assistantTurns: 0,
			toolCalls: 0,
			toolResults: 0,
			toolErrors: 0,
			usage: {
				assistant: createUsageSummary(),
				tools: createUsageSummary(),
				summaries: createUsageSummary(),
				observedTotal: createUsageSummary(),
			},
		};
		runtimes.set(key, summary);
	}
	return summary;
}

function addRuntimeUsage(
	summary: JihyeRuntimeSummary,
	kind: "assistant" | "tools" | "summaries",
	usage: UsageSummary,
): void {
	addUsage(summary.usage[kind], usage);
	addUsage(summary.usage.observedTotal, usage);
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
		.map((item) => String((item as Record<string, unknown>).text))
		.join("\n");
}

function resultIsTruncated(message: Record<string, unknown>): boolean {
	const details = isRecord(message.details) ? message.details : undefined;
	if (details?.truncated === true) return true;
	return /\[(?:output\s+)?truncated\b|\[showing lines\b/i.test(contentText(message.content));
}

function stableSerialize(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	if (isRecord(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? String(value);
}

function getSubagentResults(details: unknown): unknown[] {
	if (!isRecord(details) || !Array.isArray(details.results)) return [];
	return details.results;
}

function getChildResults(result: Record<string, unknown>): unknown[] {
	const progress = isRecord(result.progress) ? result.progress : undefined;
	if (!progress || !Array.isArray(progress.recentTools)) return [];
	const children: unknown[] = [];
	for (const tool of progress.recentTools) {
		if (!isRecord(tool) || !Array.isArray(tool.children)) continue;
		children.push(...tool.children);
	}
	return children;
}

function collectSubagents(
	results: unknown[],
	summaries: Map<string, SubagentSummary & { modelSet: Set<string> }>,
	depth: number,
): number {
	let maxDepth = depth - 1;
	for (const value of results) {
		if (!isRecord(value)) continue;
		const progress = isRecord(value.progress) ? value.progress : {};
		const agent = typeof value.agent === "string" && value.agent.trim() ? value.agent : "unknown";
		let summary = summaries.get(agent);
		if (!summary) {
			summary = {
				agent,
				calls: 0,
				failed: 0,
				durationMs: 0,
				toolCalls: 0,
				maxDepth: depth,
				models: [],
				modelSet: new Set<string>(),
				usage: createUsageSummary(),
			};
			summaries.set(agent, summary);
		}

		summary.calls += 1;
		const failed = finiteNumber(value.exitCode) !== 0
			|| progress.status === "failed"
			|| (typeof progress.error === "string" && progress.error.length > 0);
		if (failed) summary.failed += 1;
		summary.durationMs += finiteNumber(progress.durationMs);
		const recentTools = Array.isArray(progress.recentTools) ? progress.recentTools : [];
		summary.toolCalls += finiteNumber(progress.toolCount) || recentTools.length;
		summary.maxDepth = Math.max(summary.maxDepth, depth);
		if (typeof value.model === "string" && value.model) summary.modelSet.add(value.model);
		addUsage(summary.usage, usageSummary(value.usage));
		maxDepth = Math.max(maxDepth, depth);

		const children = getChildResults(value);
		if (children.length > 0) {
			maxDepth = Math.max(maxDepth, collectSubagents(children, summaries, depth + 1));
		}
	}
	return maxDepth;
}

function sumSubagentUsage(results: unknown[]): UsageSummary {
	const summaries = new Map<string, SubagentSummary & { modelSet: Set<string> }>();
	collectSubagents(results, summaries, 1);
	const total = createUsageSummary();
	for (const summary of summaries.values()) addUsage(total, summary.usage);
	return total;
}

function toolResultUsage(result: ToolResultRecord): UsageSummary {
	const declaredUsage = usageSummary(result.usage);
	if (declaredUsage.totalTokens > 0 || declaredUsage.cost > 0) return declaredUsage;
	return result.name === "subagent"
		? sumSubagentUsage(getSubagentResults(result.details))
		: declaredUsage;
}

function getOrCreateTool(tools: Map<string, ToolSummary>, name: string): ToolSummary {
	let summary = tools.get(name);
	if (!summary) {
		summary = {
			name,
			calls: 0,
			results: 0,
			errors: 0,
			missingResults: 0,
			orphanResults: 0,
			truncatedResults: 0,
		};
		tools.set(name, summary);
	}
	return summary;
}

function signal(
	kind: OperationalSignal["kind"],
	confidence: OperationalSignal["confidence"],
	tool: string,
	toolCallIds: string[],
): OperationalSignal {
	return { kind, confidence, tool, toolCallIds };
}

export function analyzeSession(
	entries: readonly SessionEntry[],
	options: AnalyzeSessionOptions = {},
): SessionObservation {
	const assistantUsage = createUsageSummary();
	const toolUsage = createUsageSummary();
	const summaryUsage = createUsageSummary();
	const models = new Map<string, ModelUsageSummary>();
	const tools = new Map<string, ToolSummary>();
	const runtimes = new Map<string, JihyeRuntimeSummary>();
	const toolCalls: ToolCallRecord[] = [];
	const toolResults: ToolResultRecord[] = [];
	const turnRecords: TurnRecord[] = [];
	let currentRuntime: JihyeRuntimeMetadata | undefined;
	let userPrompts = 0;
	let assistantTurns = 0;
	let compactions = 0;
	let modelChanges = 0;
	let thinkingLevelChanges = 0;

	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === JIHYE_RUNTIME_ENTRY_TYPE) {
			const runtime = parseJihyeRuntimeMetadata(entry.data);
			if (runtime) currentRuntime = runtime;
			continue;
		}
		if (entry.type === "compaction" || entry.type === "branch_summary") {
			if (entry.type === "compaction") compactions += 1;
			const usage = usageSummary(entry.usage);
			addUsage(summaryUsage, usage);
			addRuntimeUsage(getOrCreateRuntime(runtimes, currentRuntime), "summaries", usage);
			continue;
		}
		if (entry.type === "model_change") {
			modelChanges += 1;
			continue;
		}
		if (entry.type === "thinking_level_change") {
			thinkingLevelChanges += 1;
			continue;
		}
		if (entry.type !== "message") continue;

		const message = entry.message as unknown;
		if (!isRecord(message)) continue;
		if (message.role === "user") {
			userPrompts += 1;
			getOrCreateRuntime(runtimes, currentRuntime).userPrompts += 1;
			continue;
		}
		if (message.role === "assistant") {
			assistantTurns += 1;
			const usage = usageSummary(message.usage);
			addUsage(assistantUsage, usage);
			const runtimeSummary = getOrCreateRuntime(runtimes, currentRuntime);
			runtimeSummary.assistantTurns += 1;
			addRuntimeUsage(runtimeSummary, "assistant", usage);
			const provider = typeof message.provider === "string" && message.provider ? message.provider : "unknown";
			const model = typeof message.model === "string" && message.model ? message.model : "unknown";
			const key = `${provider}\u0000${model}`;
			let modelSummary = models.get(key);
			if (!modelSummary) {
				modelSummary = { provider, model, turns: 0, usage: createUsageSummary() };
				models.set(key, modelSummary);
			}
			modelSummary.turns += 1;
			addUsage(modelSummary.usage, usage);

			const turnEntryId = entry.id;
			const turnToolCallIds: string[] = [];
			if (Array.isArray(message.content)) {
				for (const item of message.content) {
					if (!isRecord(item) || item.type !== "toolCall") continue;
					const id = typeof item.id === "string" && item.id ? item.id : `missing-id-${toolCalls.length + 1}`;
					const name = typeof item.name === "string" && item.name ? item.name : "unknown";
					toolCalls.push({ id, name, args: item.arguments, runtime: currentRuntime });
					turnToolCallIds.push(id);
				}
			}
			runtimeSummary.toolCalls += turnToolCallIds.length;
			turnRecords.push({
				entryId: turnEntryId,
				runtime: currentRuntime,
				provider,
				model,
				usage,
				toolCallIds: turnToolCallIds,
			});
			continue;
		}
		if (message.role !== "toolResult") continue;

		const id = typeof message.toolCallId === "string" && message.toolCallId
			? message.toolCallId
			: `missing-result-id-${toolResults.length + 1}`;
		const name = typeof message.toolName === "string" && message.toolName ? message.toolName : "unknown";
		const result: ToolResultRecord = {
			id,
			name,
			isError: message.isError === true,
			isTruncated: resultIsTruncated(message),
			usage: message.usage,
			details: message.details,
			runtime: currentRuntime,
		};
		toolResults.push(result);
	}

	const resultById = new Map(toolResults.map((result) => [result.id, result]));
	const callById = new Map(toolCalls.map((call) => [call.id, call]));
	const usageByResultId = new Map<string, UsageSummary>();
	for (const result of toolResults) {
		const usage = toolResultUsage(result);
		usageByResultId.set(result.id, usage);
		addUsage(toolUsage, usage);
		const runtimeSummary = getOrCreateRuntime(runtimes, callById.get(result.id)?.runtime ?? result.runtime);
		runtimeSummary.toolResults += 1;
		if (result.isError) runtimeSummary.toolErrors += 1;
		addRuntimeUsage(runtimeSummary, "tools", usage);
	}
	const signals: OperationalSignal[] = [];

	for (const call of toolCalls) {
		const tool = getOrCreateTool(tools, call.name);
		tool.calls += 1;
		const result = resultById.get(call.id);
		if (!result) {
			tool.missingResults += 1;
			signals.push(signal("missing-tool-result", "fact", call.name, [call.id]));
		}
	}

	for (const result of toolResults) {
		const tool = getOrCreateTool(tools, result.name);
		tool.results += 1;
		if (!callById.has(result.id)) {
			tool.orphanResults += 1;
			signals.push(signal("orphan-tool-result", "fact", result.name, [result.id]));
		}
		if (result.isError) {
			tool.errors += 1;
			signals.push(signal("tool-error", "fact", result.name, [result.id]));
		}
		if (result.isTruncated) {
			tool.truncatedResults += 1;
			signals.push(signal("truncated-tool-result", "fact", result.name, [result.id]));
		}
	}

	const lastBySignature = new Map<string, ToolCallRecord>();
	for (const call of toolCalls) {
		const signature = `${call.name}\u0000${stableSerialize(call.args)}`;
		const previous = lastBySignature.get(signature);
		if (previous && resultById.get(previous.id)?.isError) {
			signals.push(signal("repeated-after-error", "heuristic", call.name, [previous.id, call.id]));
		}
		lastBySignature.set(signature, call);
	}

	const subagentMap = new Map<string, SubagentSummary & { modelSet: Set<string> }>();
	let maxSubagentDepth = 0;
	for (const result of toolResults) {
		if (result.name !== "subagent") continue;
		maxSubagentDepth = Math.max(
			maxSubagentDepth,
			collectSubagents(getSubagentResults(result.details), subagentMap, 1),
		);
	}
	const subagents = [...subagentMap.values()].map(({ modelSet, ...summary }) => ({
		...summary,
		models: [...modelSet].sort(),
	}));
	const turns: JihyeTurnObservation[] = turnRecords.map((turn) => {
		const results = turn.toolCallIds
			.map((id) => resultById.get(id))
			.filter((result): result is ToolResultRecord => !!result);
		const tools = combinedUsage(...results.map((result) => usageByResultId.get(result.id) ?? createUsageSummary()));
		return {
			entryId: turn.entryId,
			runtime: turn.runtime,
			provider: turn.provider,
			model: turn.model,
			toolCalls: turn.toolCallIds.length,
			toolResults: results.length,
			toolErrors: results.filter((result) => result.isError).length,
			usage: {
				assistant: turn.usage,
				tools,
				observedTotal: combinedUsage(turn.usage, tools),
			},
		};
	});

	return {
		schemaVersion: 2,
		session: {
			id: options.sessionId,
			name: options.sessionName,
			entries: entries.length,
			userPrompts,
			assistantTurns,
			toolCalls: toolCalls.length,
			toolResults: toolResults.length,
			toolErrors: toolResults.filter((result) => result.isError).length,
			compactions,
			modelChanges,
			thinkingLevelChanges,
			usage: {
				assistant: assistantUsage,
				tools: toolUsage,
				summaries: summaryUsage,
				observedTotal: combinedUsage(assistantUsage, toolUsage, summaryUsage),
			},
		},
		runtimes: [...runtimes.values()],
		turns,
		models: [...models.values()].sort((a, b) => b.turns - a.turns || `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`)),
		tools: [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
		subagents: subagents.sort((a, b) => b.calls - a.calls || a.agent.localeCompare(b.agent)),
		maxSubagentDepth,
		signals,
		coverage: {
			branch: "active",
			runtimeAttribution: "jihye-runtime-markers",
			parentToolTiming: "unavailable",
			subagentTrace: "final-results-only",
		},
	};
}
