export const CONTEXT_STATUS_EVENT = "ctx-manager:status";

export interface ContextUsageSnapshot {
	tokens: number;
	contextWindow: number;
}

export interface ContextStatusPayload extends ContextUsageSnapshot {
	label: string;
	percent: number;
}

const BAR_WIDTH = 10;

export function formatTokenCount(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

export function contextBar(percent: number): string {
	const clamped = Math.max(0, Math.min(1, percent));
	const filled = Math.round(clamped * BAR_WIDTH);
	return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

export function createContextStatusPayload(usage: ContextUsageSnapshot): ContextStatusPayload {
	const percent = usage.tokens / usage.contextWindow;
	const bar = contextBar(percent);
	return {
		...usage,
		percent,
		label: `ctx [${bar}] ${Math.round(percent * 100)}% (${formatTokenCount(usage.tokens)}/${formatTokenCount(usage.contextWindow)})`,
	};
}
