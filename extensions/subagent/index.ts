/**
 * Subagents extension.
 *
 * The only entrypoint pi discovers for this extension; the sibling modules are
 * internal. Composition only: it wires configuration, discovery, model
 * resolution, the runner, and the renderer into a single `subagent` tool.
 *
 * One call runs one agent. Parallelism comes from emitting several `subagent`
 * tool calls in one turn. Output is verbal only (no file handoff).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { DEFAULT_MAX_CONCURRENCY, MODEL_PROFILES_PATH, loadConfig } from "./config.ts";
import { isAgentAllowed, loadAgents, setAgents } from "./discovery.ts";
import { loadModelProfiles, resolveAgentModel, type ActiveModel, type ModelProfiles } from "./models.ts";
import {
	emitSubagentProgress,
	getSubagentProgressPhase,
	type SubagentProgressPhase,
} from "./progress-events.ts";
import { getTermWidth, renderAgentProgress } from "./render.ts";
import { Semaphore, runSubagent } from "./runner.ts";
import type { AgentResult, Details, ResolvedAgentConfig } from "./types.ts";

export { registerAgent, unregisterAgent, getAgentDirectories, loadAgentsFromDirectories } from "./discovery.ts";
export { buildPiArgs } from "./runner.ts";
export type { AgentConfig, ResolvedAgentConfig } from "./types.ts";

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	const modelProfiles: ModelProfiles = loadModelProfiles(MODEL_PROFILES_PATH, config.modelProfiles);
	const semaphore = new Semaphore(config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
	setAgents(loadAgents().filter((a) => isAgentAllowed(a.name)));

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Run a subagent to complete a task. Subagents have NO context from the current conversation — include all necessary context in the task description.",
		promptSnippet: "Run subagents for delegated tasks",
		promptGuidelines: [
			"Parallel tool calls are your primary parallelism mechanism — put multiple independent read/fetch/search calls in one function_calls block. Don't use subagents to parallelize simple I/O.",
			"Use subagent to delegate *reasoning and decisions*: codebase exploration (scout), web research (researcher), or isolated code changes (engineer)",
			"For multiple independent subagent tasks, emit multiple `subagent` tool calls in the same turn — they run in parallel automatically.",
			"Subagents have NO context from the current conversation — include ALL necessary context in the task description",
		],
		parameters: Type.Object({
			agent: Type.String({ description: "Name of the agent to invoke" }),
			task: Type.String({ description: "Task description" }),
			cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
		}),

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const cwd = params.cwd ?? ctx.cwd;
			const scopedAgents = loadAgents().filter((a) => isAgentAllowed(a.name));

			if (!params.agent || !params.task) {
				throw new Error("`subagent` requires both `agent` and `task`. To fan out work, emit multiple `subagent` tool calls in the same turn — they run in parallel.");
			}

			const agent = scopedAgents.find((a) => a.name === params.agent);
			if (!agent) {
				const available = scopedAgents.map((a) => a.name).join(", ") || "none";
				throw new Error(`Unknown agent: ${params.agent}. Available agents: ${available}`);
			}

			const resolvedAgent: ResolvedAgentConfig = {
				...agent,
				model: resolveAgentModel({
					pinnedModel: agent.model,
					tier: agent.modelTier,
					profiles: modelProfiles,
					activeModel: ctx.model as ActiveModel | undefined,
				}),
			};

			const [provider, modelId] = resolvedAgent.model.split("/");
			const contextWindow = provider && modelId ? ctx.modelRegistry.find(provider, modelId)?.contextWindow : undefined;
			const liveResult: AgentResult = {
				agent: params.agent,
				task: params.task,
				output: "",
				exitCode: -1,
				model: resolvedAgent.model,
				contextWindow,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
				progress: { agent: params.agent, status: "running" as const, task: params.task, recentTools: [], toolCount: 0, tokens: 0, durationMs: 0, lastMessage: "" },
			};

			let lastProgressPhase: SubagentProgressPhase | undefined;
			const publishProgress = () => {
				const phase = getSubagentProgressPhase(liveResult.progress);
				if (phase === lastProgressPhase) return;
				lastProgressPhase = emitSubagentProgress(pi.events, toolCallId, liveResult.progress);
			};
			const result = await semaphore.run(() => {
				publishProgress();
				return runSubagent(resolvedAgent, params.task!, cwd, signal, (progress, usage) => {
					liveResult.progress = progress;
					liveResult.usage = { ...usage };
					publishProgress();
					onUpdate?.({
						content: [{ type: "text", text: "(running...)" }],
						details: { results: [liveResult] },
					});
				});
			});

			result.contextWindow = contextWindow;
			const isError = result.exitCode !== 0 || !!result.progress.error;
			return {
				content: [{ type: "text", text: result.output || "(no output)" }],
				details: { results: [result] },
				...(isError ? { isError: true } : {}),
			};
		},

		renderCall(args, theme, context) {
			if (!context.expanded) {
				if (!args.agent) {
					return new Text(theme.fg("toolTitle", theme.bold("subagent")), 0, 0);
				}
				const taskPreview = args.task
					? (args.task.length > 60 ? args.task.slice(0, 60) + "…" : args.task).replace(/\n/g, " ")
					: "";
				return new Text(
					`${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("accent", args.agent)} ${theme.fg("dim", taskPreview)}`,
					0, 0,
				);
			}

			const c = context.lastComponent instanceof Container
				? (context.lastComponent.clear(), context.lastComponent)
				: new Container();
			const agentLabel = args.agent ? ` ${theme.fg("accent", args.agent)}` : "";
			const cwdLabel = args.cwd ? theme.fg("dim", ` (cwd: ${args.cwd})`) : "";
			c.addChild(new Text(`${theme.fg("toolTitle", theme.bold("subagent"))}${agentLabel}${cwdLabel}`, 0, 0));
			if (args.task) {
				c.addChild(new Spacer(1));
				c.addChild(new Text(theme.fg("text", args.task), 0, 0));
			}
			return c;
		},

		renderResult(result, options, theme, context) {
			const details = result.details as Details | undefined;
			if (!details?.results?.length) {
				const t = result.content[0];
				const text = t?.type === "text" ? t.text : "(no output)";
				return new Text(text.slice(0, 200), 0, 0);
			}

			const w = getTermWidth() - 4;
			const expanded = options.expanded;
			const c = new Container();
			c.addChild(renderAgentProgress(details.results[0], theme, expanded, w));
			return c;
		},
	});
}
