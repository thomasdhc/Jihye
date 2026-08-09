/**
 * Subagent execution: builds the child `pi` invocation, spawns it, and parses
 * its JSON event stream into live `AgentProgress` / `AgentResult` state.
 *
 * Sole owner of the child-process contract. Imports `config.ts` and `types.ts`;
 * it knows nothing about tool registration or terminal rendering.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { truncateHead, withFileMutationQueue, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";

import { BASH_GUARD_EXTENSION, BUILTIN_TOOLS, CUSTOM_TOOL_EXTENSIONS, JIHYE_SETUP_EXTENSION, resolvePiBinary } from "./config.ts";
import type { AgentProgress, AgentResult, ResolvedAgentConfig } from "./types.ts";

export async function buildPiArgs(
	agent: ResolvedAgentConfig,
	task: string,
	cwd: string,
): Promise<{ args: string[]; tempDir: string; childEnv: NodeJS.ProcessEnv }> {
	const piBin = resolvePiBinary();
	const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-sub-"));

	const promptPath = path.join(tempDir, `${agent.name}.md`);
	await withFileMutationQueue(promptPath, async () => {
		await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
	});

	const args = [...piBin.baseArgs, "--mode", "json", "-p", "--no-session", "--no-skills"];

	const allowlist: string[] = [];
	const extensionPaths = new Set<string>([JIHYE_SETUP_EXTENSION]);

	for (const tool of agent.tools) {
		if (BUILTIN_TOOLS.has(tool)) {
			allowlist.push(tool);
			if (tool === "bash") extensionPaths.add(BASH_GUARD_EXTENSION);
		} else if (CUSTOM_TOOL_EXTENSIONS[tool]) {
			allowlist.push(tool);
			extensionPaths.add(CUSTOM_TOOL_EXTENSIONS[tool]);
		}
	}

	// Start the child from zero extensions, restore the bundled setup extension
	// as prompt infrastructure, then add only extensions its declared tools need.
	args.push("--no-extensions");

	if (allowlist.length > 0) {
		args.push("--tools", allowlist.join(","));
	} else {
		args.push("--no-tools");
	}

	for (const extPath of extensionPaths) {
		args.push("--extension", extPath);
	}

	args.push("--model", agent.model);
	args.push("--thinking", agent.thinking);
	args.push("--append-system-prompt", promptPath);

	// Long tasks are passed as a file reference rather than argv, which is
	// size-limited by the OS.
	const TASK_LIMIT = 8000;
	if (task.length > TASK_LIMIT) {
		const taskPath = path.join(tempDir, "task.md");
		await withFileMutationQueue(taskPath, async () => {
			await fs.promises.writeFile(taskPath, `Task: ${task}`, { encoding: "utf-8", mode: 0o600 });
		});
		args.push(`@${taskPath}`);
	} else {
		args.push(`Task: ${task}`);
	}

	const currentDepth = Number(process.env.PI_SUBAGENT_DEPTH ?? "0");
	const normalizedDepth = Number.isFinite(currentDepth) && currentDepth >= 0
		? Math.trunc(currentDepth)
		: 0;
	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		PI_SUBAGENT_DEPTH: String(normalizedDepth + 1),
	};
	// Clear before re-setting: an allowlist inherited from our own parent must
	// not leak into a grandchild that this agent did not scope.
	delete childEnv.PI_SUBAGENT_ALLOWED;
	if (agent.tools.includes("subagent") && agent.subagentAgents && agent.subagentAgents.length > 0) {
		childEnv.PI_SUBAGENT_ALLOWED = agent.subagentAgents.join(",");
	}

	return { args: [piBin.command, ...args], tempDir, childEnv };
}

/** Grace period between SIGTERM and SIGKILL for a child that ignores the first signal. */
export const SIGKILL_ESCALATION_MS = 3000;

/** The child-process surface `terminateChild` needs, so it can be tested with a fake. */
export interface TerminableChild {
	/** `null` while the child is still running. */
	readonly exitCode: number | null;
	kill(signal: NodeJS.Signals): boolean;
	once(event: "close", listener: () => void): unknown;
}

/**
 * Terminate a child, escalating to SIGKILL only if it is still running after
 * `timeoutMs`. `ChildProcess.killed` only reports that a signal was delivered,
 * so exit has to be tracked separately or the escalation never fires.
 *
 * Returns a cancel function; the escalation timer is also cleared on exit, so
 * it cannot outlive the child and keep the event loop alive.
 */
export function terminateChild(child: TerminableChild, timeoutMs = SIGKILL_ESCALATION_MS): () => void {
	let exited = child.exitCode !== null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
	};

	child.once("close", () => {
		exited = true;
		cancel();
	});
	child.kill("SIGTERM");
	if (exited) return cancel;

	timer = setTimeout(() => {
		timer = undefined;
		if (!exited) child.kill("SIGKILL");
	}, timeoutMs);
	return cancel;
}

function extractTextFromContent(content: unknown): string {
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");
	}
	return "";
}

function flatten(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

const MAX_ARG_PREVIEW = 4000;

function extractToolArgsPreview(args: Record<string, unknown>): string {
	const cap = (s: string) => (s.length > MAX_ARG_PREVIEW ? s.slice(0, MAX_ARG_PREVIEW) + "…" : s);
	if (args.command) return cap(flatten(String(args.command)));
	if (args.path) return cap(flatten(String(args.path)));
	if (args.query) return `"${cap(flatten(String(args.query)))}"`;
	if (args.url) return cap(flatten(String(args.url)));
	if (args.pattern) return cap(flatten(String(args.pattern)));
	if (args.agent) return flatten(String(args.agent));
	if (Array.isArray(args.tasks)) {
		const names = (args.tasks as Array<{ agent?: string }>)
			.map((t) => t?.agent || "?")
			.join(", ");
		return `parallel(${names})`;
	}
	return cap(flatten(JSON.stringify(args)));
}

export async function runSubagent(
	agent: ResolvedAgentConfig,
	task: string,
	cwd: string,
	signal: AbortSignal | undefined,
	onUpdate?: (progress: AgentProgress, usage: AgentResult["usage"]) => void,
): Promise<AgentResult> {
	const { args, tempDir, childEnv } = await buildPiArgs(agent, task, cwd);
	const command = args[0];
	const spawnArgs = args.slice(1);

	const result: AgentResult = {
		agent: agent.name,
		task,
		output: "",
		exitCode: 0,
		model: agent.model,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: {
			agent: agent.name,
			status: "running",
			task,
			recentTools: [],
			toolCount: 0,
			tokens: 0,
			durationMs: 0,
			lastMessage: "",
		},
	};

	const startTime = Date.now();
	const progress = result.progress;

	const fireUpdate = throttle(() => {
		progress.durationMs = Date.now() - startTime;
		onUpdate?.(progress, result.usage);
	}, 150);

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn(command, spawnArgs, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: childEnv,
		});

		let buf = "";
		let stderrBuf = "";

		const processLine = (line: string) => {
			if (!line.trim()) return;
			try {
				const evt = JSON.parse(line) as any;
				progress.durationMs = Date.now() - startTime;

				if (evt.type === "tool_execution_start") {
					progress.toolCount++;
					progress.recentTools.push({
						tool: evt.toolName,
						args: extractToolArgsPreview((evt.args || {}) as Record<string, unknown>),
						toolCallId: evt.toolCallId,
						status: "running",
					});
					fireUpdate();
				}

				if (evt.type === "tool_execution_update") {
					const partial = evt.partialResult as { details?: { results?: unknown } } | undefined;
					const nested = partial?.details?.results;
					if (evt.toolName === "subagent" && Array.isArray(nested) && evt.toolCallId) {
						const hit = progress.recentTools.find((t) => t.toolCallId === evt.toolCallId);
						if (hit) {
							hit.children = nested as AgentResult[];
							fireUpdate();
						}
					}
				}

				if (evt.type === "tool_execution_end") {
					const hit = evt.toolCallId
						? progress.recentTools.find((t) => t.toolCallId === evt.toolCallId)
						: undefined;
					if (hit) {
						hit.status = "done";
						const finalResult = evt.result as { details?: { results?: unknown } } | undefined;
						const finalChildren = finalResult?.details?.results;
						if (evt.toolName === "subagent" && Array.isArray(finalChildren)) {
							hit.children = finalChildren as AgentResult[];
						}
					}
					fireUpdate();
				}

				if (evt.type === "tool_result_end") {
					fireUpdate();
				}

				if (evt.type === "message_end" && evt.message) {
					if (evt.message.role === "assistant") {
						result.usage.turns++;
						const u = evt.message.usage;
						if (u) {
							result.usage.input += u.input || 0;
							result.usage.output += u.output || 0;
							result.usage.cacheRead += u.cacheRead || 0;
							result.usage.cacheWrite += u.cacheWrite || 0;
							result.usage.cost += u.cost?.total || 0;
							progress.tokens = (u as { totalTokens?: number }).totalTokens
								|| (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0);
						}
						if (evt.message.model) result.model = evt.message.model;
						if (evt.message.errorMessage) progress.error = evt.message.errorMessage;

						const text = extractTextFromContent(evt.message.content);
						if (text) {
							result.output = text;
							const proseLines: string[] = [];
							let inCodeBlock = false;
							for (const line of text.split("\n")) {
								if (line.trimStart().startsWith("```")) {
									inCodeBlock = !inCodeBlock;
									continue;
								}
								if (!inCodeBlock && line.trim()) {
									proseLines.push(line.trim());
								}
							}
							if (proseLines.length > 0) {
								progress.lastMessage = proseLines.slice(0, 3).join(" ");
							}
						}
					}

					fireUpdate();
				}
			} catch {
				// The child emits one JSON event per line, but stray non-JSON output
				// (warnings, banners) must not abort stream parsing.
			}
		};

		proc.stdout.on("data", (d: Buffer) => {
			buf += d.toString();
			const lines = buf.split("\n");
			buf = lines.pop() || "";
			lines.forEach(processLine);
		});

		proc.stderr.on("data", (d: Buffer) => {
			stderrBuf += d.toString();
		});

		proc.on("close", (code) => {
			if (buf.trim()) processLine(buf);
			if (code !== 0 && stderrBuf.trim() && !progress.error) {
				progress.error = stderrBuf.trim();
			}
			resolve(code ?? 1);
		});

		proc.on("error", () => resolve(1));

		if (signal) {
			// Give the child a chance to exit cleanly, then escalate so an ignored
			// SIGTERM cannot keep the parent's tool call pending forever.
			const kill = () => {
				terminateChild(proc);
			};
			if (signal.aborted) kill();
			else signal.addEventListener("abort", kill, { once: true });
		}
	});

	try {
		fs.rmSync(tempDir, { recursive: true, force: true });
	} catch {}

	result.exitCode = exitCode;
	progress.status = exitCode === 0 && !progress.error ? "completed" : "failed";
	progress.durationMs = Date.now() - startTime;
	if (progress.error) result.output = result.output || `Error: ${progress.error}`;

	// Settle the throttle before returning: a trailing timer that survived this
	// point would call `onUpdate` after the tool call has already reported its
	// final result, and would keep the event loop alive until it fired.
	fireUpdate.flush();

	if (result.output.length > DEFAULT_MAX_BYTES) {
		const trunc = truncateHead(result.output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
		result.output = trunc.content;
		if (trunc.truncated) {
			result.output += "\n\n[Output truncated]";
		}
	}

	return result;
}

/** A throttled function plus the escape hatch that settles its pending call. */
export type Throttled<T extends (...args: any[]) => void> = T & {
	/** Run a pending trailing call now and clear its timer. No-op when nothing is pending. */
	flush(): void;
};

/** Leading-edge throttle with a trailing call, so the final update is never lost. */
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): Throttled<T> {
	let lastCall = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: (() => void) | undefined;

	const run = (args: any[]) => {
		timer = undefined;
		pending = undefined;
		lastCall = Date.now();
		fn(...args);
	};

	const throttled = ((...args: any[]) => {
		const remaining = ms - (Date.now() - lastCall);
		if (remaining <= 0) {
			if (timer) clearTimeout(timer);
			run(args);
		} else if (!timer) {
			pending = () => run(args);
			timer = setTimeout(() => pending?.(), remaining);
		}
	}) as Throttled<T>;

	throttled.flush = () => {
		if (!timer) return;
		clearTimeout(timer);
		pending?.();
	};

	return throttled;
}

/** Bounds how many child pi processes one parent session runs at once. */
export class Semaphore {
	private inFlight = 0;
	private readonly waiters: Array<() => void> = [];
	private readonly max: number;
	constructor(max: number) {
		this.max = max;
	}
	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.inFlight >= this.max) {
			await new Promise<void>((r) => this.waiters.push(r));
		}
		this.inFlight++;
		try {
			return await fn();
		} finally {
			this.inFlight--;
			const next = this.waiters.shift();
			if (next) next();
		}
	}
}
