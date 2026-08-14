import type { OperationalSignal, SessionObservation, UsageSummary } from "./types.ts";

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
	return `${value} ${value === 1 ? singular : pluralForm}`;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}m`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}k`;
	return String(tokens);
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)}s`;
	const minutes = Math.floor(durationMs / 60_000);
	const seconds = Math.round((durationMs % 60_000) / 1_000);
	return `${minutes}m ${seconds}s`;
}

function formatUsage(usage: UsageSummary): string {
	return `${formatTokens(usage.totalTokens)} tokens · ${formatCost(usage.cost)}`;
}

function runtimeLabel(runtime: SessionObservation["runtimes"][number]["runtime"]): string {
	return runtime
		? `Jihye ${runtime.jihyeVersion} · Pi ${runtime.piVersion} · ${runtime.profile}`
		: "Unknown Jihye runtime";
}

function signalLabel(signal: OperationalSignal): string {
	switch (signal.kind) {
		case "tool-error": return "tool error";
		case "missing-tool-result": return "missing tool result";
		case "orphan-tool-result": return "orphan tool result";
		case "truncated-tool-result": return "truncated tool result";
		case "repeated-after-error": return "repeated after error";
	}
}

function formatToolCallId(id: string): string {
	return id.length > 20 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
}

function formatSignals(signals: OperationalSignal[]): string[] {
	const groups = new Map<string, { signal: OperationalSignal; count: number; ids: string[] }>();
	for (const current of signals) {
		const key = `${current.confidence}\u0000${current.kind}\u0000${current.tool}`;
		let group = groups.get(key);
		if (!group) {
			group = { signal: current, count: 0, ids: [] };
			groups.set(key, group);
		}
		group.count += 1;
		for (const id of current.toolCallIds) {
			if (!group.ids.includes(id)) group.ids.push(id);
		}
	}

	return [...groups.values()].map(({ signal, count, ids }) => {
		const evidence = ids.slice(0, 3).map(formatToolCallId).join(", ");
		const more = ids.length > 3 ? `, +${ids.length - 3} more` : "";
		return `  ${signal.confidence.toUpperCase()} · ${plural(count, signalLabel(signal))} · ${signal.tool} (${evidence}${more})`;
	});
}

export function formatObservationReport(report: SessionObservation): string {
	const lines: string[] = ["Jihye session observation"];
	if (report.session.name || report.session.id) {
		lines.push(`Session: ${report.session.name ?? "unnamed"}${report.session.id ? ` · ${report.session.id}` : ""}`);
	}
	lines.push(
		`Active branch: ${plural(report.session.userPrompts, "prompt")} · ${plural(report.session.assistantTurns, "assistant turn")} · ${plural(report.session.toolCalls, "tool call")}`,
		`Lifecycle: ${plural(report.session.compactions, "compaction")} · ${plural(report.session.modelChanges, "model change")} · ${plural(report.session.thinkingLevelChanges, "thinking-level change")}`,
		`Usage: ${formatUsage(report.session.usage.observedTotal)} observed `
			+ `(assistant ${formatTokens(report.session.usage.assistant.totalTokens)} · tools ${formatTokens(report.session.usage.tools.totalTokens)} · summaries ${formatTokens(report.session.usage.summaries.totalTokens)})`,
	);

	lines.push("", "Jihye runtimes");
	if (report.runtimes.length === 0) lines.push("  None observed");
	for (const runtime of report.runtimes) {
		lines.push(
			`  ${runtimeLabel(runtime.runtime)} · ${plural(runtime.assistantTurns, "assistant turn")} · `
			+ `${plural(runtime.toolCalls, "tool call")} · ${runtime.toolErrors} errors · ${formatUsage(runtime.usage.observedTotal)}`,
		);
	}

	lines.push("", "Models");
	if (report.models.length === 0) lines.push("  None observed");
	for (const model of report.models) {
		lines.push(`  ${model.provider}/${model.model} · ${plural(model.turns, "turn")} · ${formatUsage(model.usage)}`);
	}

	lines.push("", "Tools");
	if (report.tools.length === 0) lines.push("  None observed");
	for (const tool of report.tools) {
		const details = [
			plural(tool.calls, "call"),
			plural(tool.results, "result"),
			plural(tool.errors, "error"),
		];
		if (tool.missingResults > 0) details.push(`${tool.missingResults} missing`);
		if (tool.orphanResults > 0) details.push(`${tool.orphanResults} orphaned`);
		if (tool.truncatedResults > 0) details.push(`${tool.truncatedResults} truncated`);
		lines.push(`  ${tool.name} · ${details.join(" · ")}`);
	}

	lines.push("", `Subagents · max depth ${report.maxSubagentDepth}`);
	if (report.subagents.length === 0) lines.push("  None observed");
	for (const subagent of report.subagents) {
		const models = subagent.models.length > 0 ? ` · ${subagent.models.join(", ")}` : "";
		lines.push(
			`  ${subagent.agent} · ${plural(subagent.calls, "call")} · ${subagent.failed} failed · `
			+ `${plural(subagent.toolCalls, "child tool")} · ${formatUsage(subagent.usage)} · ${formatDuration(subagent.durationMs)}${models}`,
		);
	}

	lines.push("", "Operational signals");
	if (report.signals.length === 0) lines.push("  None observed");
	else lines.push(...formatSignals(report.signals));

	lines.push(
		"",
		"Coverage",
		"  Active branch only · runtime attribution from Jihye markers · parent tool timing unavailable · subagent traces contain final results only",
	);
	return lines.join("\n");
}
