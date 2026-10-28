/**
 * MCP backend for web-search: delegates to a configured MCP tool through
 * pi's programmatic tool invocation instead of calling Serper.
 *
 * Owns the callable-tool readiness wait (built-in MCP connects configured
 * servers after the session settles, so the tool is not callable on the
 * first moments of a cold child) and the mapping from gateway-style result
 * envelopes to the shared SearchResult shape.
 */
import type { AgentToolCallOutcome, AgentToolResult } from "@earendil-works/pi-agent-core";

/**
 * Minimal view of the tool context the MCP backend needs. The extension
 * passes a live shim over ExtensionToolContext; tests pass fakes. `tools`
 * must be read fresh on every access because MCP tools appear late.
 */
export interface McpToolCaller {
	readonly tools: readonly { name: string }[];
	executeTool(name: string, args: unknown, options?: { signal?: AbortSignal }): Promise<AgentToolCallOutcome>;
}

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface RawMcpSearchEntry {
	url: string;
	title: string;
	content: string;
	/** Parsed `_north_metadata.score`; 0 when absent or unparseable. */
	score: number;
}

/** MCP tools register after session start; bound the wait so an absent server fails predictably. */
export const MCP_TOOL_READY_TIMEOUT_MS = 15000;
const MCP_TOOL_POLL_INTERVAL_MS = 250;

/** Keep mapped snippets near Serper's size; gateway payloads carry per-entry content of a few hundred characters. */
export const SNIPPET_MAX_CHARS = 320;

const HTML_ENTITY_NAMES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

/** Reduce upstream content to a displayable snippet: tags, entities, and runs of whitespace out. */
export function cleanSnippet(raw: string, maxChars: number = SNIPPET_MAX_CHARS): string {
	let text = raw.replace(/<[^>]*>/g, " ");
	text = text
		.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITY_NAMES[name.toLowerCase()] ?? match);
	text = text.replace(/\s+/g, " ").trim();
	return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function rawEntryFrom(value: unknown): RawMcpSearchEntry | undefined {
	if (!value || typeof value !== "object") return undefined;
	const entry = value as Record<string, unknown>;
	if (typeof entry.url !== "string" || entry.url === "") return undefined;
	if (typeof entry.title !== "string" || entry.title === "") return undefined;
	const metadata = entry._north_metadata as Record<string, unknown> | undefined;
	const score = Number.parseFloat(String(metadata?.score));
	return {
		url: entry.url,
		title: entry.title,
		content: typeof entry.content === "string" ? entry.content : "",
		score: Number.isFinite(score) ? score : 0,
	};
}

/**
 * Accept the gateway envelope in the observed MCP result shapes: the entries
 * array itself, the tool's declared output envelope `{ result: [...] }`, a
 * JSON string of either, and the CallToolResult-shaped structuredContent
 * `{ content: [{ type: "text", text: "...json..." }] }` that pi's MCP client
 * reports. Entries without a usable url or title are dropped; an entry with
 * no content maps to an empty snippet.
 */
export function parseMcpSearchPayload(payload: unknown): RawMcpSearchEntry[] {
	let envelope = payload;
	// Unwrap at most two levels: a JSON string, then a carrier object.
	for (let depth = 0; depth < 2; depth += 1) {
		if (typeof envelope === "string") {
			try {
				envelope = JSON.parse(envelope);
			} catch {
				throw new Error(`MCP web search returned non-JSON text: ${envelope.slice(0, 120)}`);
			}
			continue;
		}
		if (Array.isArray(envelope)) break;
		const record = envelope as Record<string, unknown> | undefined;
		if (Array.isArray(record?.result)) {
			envelope = record.result;
			break;
		}
		const content = record?.content;
		if (Array.isArray(content) && content.some((block) => block?.type === "text")) {
			envelope = content.find((block) => block?.type === "text").text as string;
			continue;
		}
		break;
	}
	if (!Array.isArray(envelope)) {
		throw new Error("MCP web search returned an unexpected payload shape (missing result array)");
	}
	return envelope.map(rawEntryFrom).filter((entry): entry is RawMcpSearchEntry => entry !== undefined);
}

/** Prefer structuredContent when the MCP tool provides it; otherwise parse the text block. */
export function extractPayload(result: AgentToolResult): unknown {
	if (result.structuredContent !== undefined) return result.structuredContent;
	const text = result.content.find((block) => block.type === "text");
	if (!text || text.type !== "text") {
		throw new Error("MCP web search returned no text content");
	}
	return text.text;
}

/** Sort by descending `_north_metadata.score`, keeping the original order for ties and scoreless entries. */
export function sortEntriesByScore(entries: RawMcpSearchEntry[]): RawMcpSearchEntry[] {
	const sorted = entries.slice();
	const order = new Map(entries.map((entry, index) => [entry, index]));
	sorted.sort((a, b) => {
		const diff = b.score - a.score;
		if (diff !== 0) return diff;
		return (order.get(a) ?? 0) - (order.get(b) ?? 0);
	});
	return sorted;
}

/**
 * Wait until the target tool is callable. Built-in MCP connects configured
 * servers in the background, so a cold session offers `ctx.tools` without
 * MCP entries for the first second or two; failing fast would break cold
 * subagents outright.
 */
export async function waitForCallableTool(
	caller: McpToolCaller,
	toolName: string,
	timeoutMs: number = MCP_TOOL_READY_TIMEOUT_MS,
	pollMs: number = MCP_TOOL_POLL_INTERVAL_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		if (caller.tools.some((tool) => tool.name === toolName)) return;
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
	throw new Error(
		`MCP web search tool "${toolName}" was not callable within ${timeoutMs} ms. Check that the MCP server is configured and connected (run "pi mcp list"), then /reload.`,
	);
}

/** Run one search through the configured MCP tool and normalize the result. */
export async function runMcpToolSearch(
	caller: McpToolCaller,
	toolName: string,
	query: string,
	count: number,
	signal?: AbortSignal,
	timeoutMs: number = MCP_TOOL_READY_TIMEOUT_MS,
): Promise<SearchResult[]> {
	await waitForCallableTool(caller, toolName, timeoutMs);
	const outcome = await caller.executeTool(toolName, { query }, { signal });
	if (outcome.isError) {
		const text = outcome.result.content.find((block) => block.type === "text");
		const message = text?.type === "text" ? text.text : "unknown error";
		throw new Error(`MCP web search failed: ${message.slice(0, 300)}`);
	}
	const payload = extractPayload(outcome.result);
	const entries = parseMcpSearchPayload(payload);
	const sorted = sortEntriesByScore(entries);
	return sorted.slice(0, count).map((entry) => ({
		title: entry.title,
		url: entry.url,
		snippet: cleanSnippet(entry.content),
	}));
}
