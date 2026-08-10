import type { AgentProgress } from "./types.ts";

export const SUBAGENT_PROGRESS_EVENT = "jihye:subagent-progress";

export type SubagentProgressPhase = "thinking" | "working";

export interface SubagentProgressEvent {
	toolCallId: string;
	phase: SubagentProgressPhase;
}

export function getSubagentProgressPhase(progress: AgentProgress): SubagentProgressPhase {
	return progress.recentTools.some((tool) => tool.status === "running") ? "working" : "thinking";
}

export function isSubagentProgressEvent(payload: unknown): payload is SubagentProgressEvent {
	if (!payload || typeof payload !== "object") return false;
	const candidate = payload as Partial<SubagentProgressEvent>;
	return typeof candidate.toolCallId === "string"
		&& candidate.toolCallId.length > 0
		&& (candidate.phase === "thinking" || candidate.phase === "working");
}

export function emitSubagentProgress(
	events: { emit(event: string, payload: SubagentProgressEvent): void },
	toolCallId: string,
	progress: AgentProgress,
): SubagentProgressPhase {
	const phase = getSubagentProgressPhase(progress);
	events.emit(SUBAGENT_PROGRESS_EVENT, { toolCallId, phase });
	return phase;
}
