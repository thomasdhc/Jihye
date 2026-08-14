import type { JihyeRuntimeMetadata } from "../jihye-setup/provenance.ts";

export interface UsageSummary {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
}

export interface ModelUsageSummary {
	provider: string;
	model: string;
	turns: number;
	usage: UsageSummary;
}

export interface ToolSummary {
	name: string;
	calls: number;
	results: number;
	errors: number;
	missingResults: number;
	orphanResults: number;
	truncatedResults: number;
}

export interface SubagentSummary {
	agent: string;
	calls: number;
	failed: number;
	durationMs: number;
	toolCalls: number;
	maxDepth: number;
	models: string[];
	usage: UsageSummary;
}

export interface JihyeTurnObservation {
	entryId: string;
	runtime?: JihyeRuntimeMetadata;
	provider: string;
	model: string;
	toolCalls: number;
	toolResults: number;
	toolErrors: number;
	usage: {
		assistant: UsageSummary;
		tools: UsageSummary;
		observedTotal: UsageSummary;
	};
}

export interface JihyeRuntimeSummary {
	runtime?: JihyeRuntimeMetadata;
	userPrompts: number;
	assistantTurns: number;
	toolCalls: number;
	toolResults: number;
	toolErrors: number;
	usage: {
		assistant: UsageSummary;
		tools: UsageSummary;
		summaries: UsageSummary;
		observedTotal: UsageSummary;
	};
}

export type OperationalSignalKind =
	| "tool-error"
	| "missing-tool-result"
	| "orphan-tool-result"
	| "truncated-tool-result"
	| "repeated-after-error";

export interface OperationalSignal {
	kind: OperationalSignalKind;
	confidence: "fact" | "heuristic";
	tool: string;
	toolCallIds: string[];
}

export interface SessionObservation {
	schemaVersion: 2;
	session: {
		id?: string;
		name?: string;
		entries: number;
		userPrompts: number;
		assistantTurns: number;
		toolCalls: number;
		toolResults: number;
		toolErrors: number;
		compactions: number;
		modelChanges: number;
		thinkingLevelChanges: number;
		usage: {
			assistant: UsageSummary;
			tools: UsageSummary;
			summaries: UsageSummary;
			observedTotal: UsageSummary;
		};
	};
	runtimes: JihyeRuntimeSummary[];
	turns: JihyeTurnObservation[];
	models: ModelUsageSummary[];
	tools: ToolSummary[];
	subagents: SubagentSummary[];
	maxSubagentDepth: number;
	signals: OperationalSignal[];
	coverage: {
		branch: "active";
		runtimeAttribution: "jihye-runtime-markers";
		parentToolTiming: "unavailable";
		subagentTrace: "final-results-only";
	};
}

export interface AnalyzeSessionOptions {
	sessionId?: string;
	sessionName?: string;
}
