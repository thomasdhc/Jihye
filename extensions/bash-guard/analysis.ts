/**
 * Risk analysis for bash-guard.
 *
 * Turns a shell command into a `Risk` by applying the policy tables and the
 * heuristic rules for destructive local commands.
 */
import {
	DANGEROUS_GITHUB_CLI_COMMANDS,
	DANGEROUS_GITLAB_CLI_COMMANDS,
	HEADLESS_GIT_BLOCKED,
	RISKY_LOCAL_COMMANDS,
	SAFE_DEV_PATHS,
	SYSTEM_PATH_PREFIXES,
	type ArgCondition,
	type CliRule,
	type CliRulePolicy,
	type CliRuleTable,
	type CommandToken,
	type HeadlessGitRule,
	type LocalCommandRule,
	type Severity,
} from "./policy.ts";
import {
	anyArgStartsWith,
	enabledBooleanOption,
	formatSegment,
	gitCommandCandidates,
	hasOption,
	isDynamicShellToken,
	isOpToken,
	nestedShellCommand,
	optionValues,
	parseShellCommand,
	splitOnOps,
	tokensToStrings,
	unwrapShellCommand,
	withoutHostedCliContextOptions,
	type Token,
} from "./shell.ts";

type RiskDetails = {
	severity: Severity;
	reasons: string[];
	requiresInteractiveApproval?: boolean;
};

export type Risk = RiskDetails & {
	flaggedCommands: string[];
	requiresInteractiveApproval: boolean;
};

type HostedCliRule = RiskDetails & {
	command: readonly string[];
	anyOptions?: readonly string[];
	excludedOptions?: readonly string[];
};

// A policy entry is either a single rule or several variants of the same subcommand.
function ruleVariants(policy: CliRulePolicy): readonly CliRule[] {
	return typeof policy[0] === "string" ? [policy as CliRule] : (policy as readonly CliRule[]);
}

// Expand the readable policy tables into the flat, pre-split rule list the matcher walks.
function toHostedCliRules(table: CliRuleTable): readonly HostedCliRule[] {
	return Object.entries(table).flatMap(([command, policy]) =>
		ruleVariants(policy).map(([severity, reason, options]) => ({
			command: command.split(/\s+/),
			severity,
			reasons: [reason],
			...options,
		})),
	);
}

const DANGEROUS_GITHUB_CLI_RULES = toHostedCliRules(DANGEROUS_GITHUB_CLI_COMMANDS);
const DANGEROUS_GITLAB_CLI_RULES = toHostedCliRules(DANGEROUS_GITLAB_CLI_COMMANDS);

function analyzeHostedApi(
	args: string[],
	cli: "gh" | "glab",
	options: { formImpliesPost?: boolean; safeMethods?: readonly string[] } = {},
): RiskDetails | null {
	const explicitMethod = optionValues(args, "-X", "--method").at(-1)?.toUpperCase();
	const rawFields = optionValues(args, "-f", "--raw-field");
	const typedFields = optionValues(args, "-F", "--field");
	const fields = [...rawFields, ...typedFields];
	const hasInput = hasOption(args, "--input");
	const hasForm = options.formImpliesPost === true && hasOption(args, "--form");
	const effectiveMethod = explicitMethod ?? (fields.length > 0 || hasInput || hasForm ? "POST" : "GET");
	const safeMethods = options.safeMethods ?? ["GET", "HEAD"];

	if (safeMethods.includes(effectiveMethod)) return null;

	if (args.includes("graphql")) {
		const queries = fields
			.filter((field) => field.startsWith("query="))
			.map((field) => field.slice("query=".length));
		if (queries.some((query) => /\bmutation\b/i.test(query))) {
			return { severity: "high", reasons: [`${cli} api GraphQL mutation (authenticated remote mutation)`] };
		}
		const hasDynamicQuery = queries.some(
			(query) => query.includes("$(") || query.includes("`") || /^\$[A-Za-z_]/.test(query),
		);
		const typedQueries = typedFields
			.filter((field) => field.startsWith("query="))
			.map((field) => field.slice("query=".length));
		if (hasInput || hasForm || hasDynamicQuery || typedQueries.some((query) => query.startsWith("@"))) {
			return {
				severity: "high",
				reasons: [`${cli} api GraphQL request from external input (mutation cannot be verified)`],
			};
		}
		// GraphQL queries use POST as their transport but do not mutate remote state.
		if (effectiveMethod === "POST") return null;
	}

	return {
		severity: "high",
		reasons: [`${cli} api ${effectiveMethod} (authenticated API request may mutate remote state)`],
	};
}

function analyzeGitHubApi(args: string[]): RiskDetails | null {
	return analyzeHostedApi(args, "gh");
}

function analyzeGitLabApi(args: string[]): RiskDetails | null {
	return analyzeHostedApi(args, "glab", { formImpliesPost: true, safeMethods: ["GET", "HEAD", "OPTIONS"] });
}

function analyzeDynamicHostedCliCommand(
	args: string[],
	rules: readonly HostedCliRule[],
	cli: "gh" | "glab",
): RiskDetails | null {
	let matched = false;
	let severity: Severity = "medium";
	let requiresInteractiveApproval = false;
	for (const rule of rules) {
		for (let index = 0; index < rule.command.length; index++) {
			if (args[index] === rule.command[index]) continue;
			if (isDynamicShellToken(args[index])) {
				matched = true;
				if (rule.severity === "high") severity = "high";
				if (rule.requiresInteractiveApproval) requiresInteractiveApproval = true;
			}
			break;
		}
	}
	if (!matched) return null;
	return {
		severity,
		reasons: [`${cli} dynamic command or subcommand (may resolve to a guarded remote operation)`],
		requiresInteractiveApproval,
	};
}

function analyzeGitHubCliArgs(rawArgs: string[]): RiskDetails | null {
	const args = unwrapShellCommand(rawArgs);
	if (args[0] !== "gh" && !args[0]?.endsWith("/gh")) return null;
	const ghArgs = args.slice(1);
	const commandArgs = withoutHostedCliContextOptions(ghArgs);
	if (commandArgs[0] === "api") return analyzeGitHubApi(commandArgs.slice(1));

	const dynamicCommandRisk = analyzeDynamicHostedCliCommand(commandArgs, DANGEROUS_GITHUB_CLI_RULES, "gh");
	if (dynamicCommandRisk) return dynamicCommandRisk;
	for (const rule of DANGEROUS_GITHUB_CLI_RULES) {
		if (!rule.command.every((part, index) => commandArgs[index] === part)) continue;
		if (rule.anyOptions && !rule.anyOptions.some((option) => hasOption(ghArgs, option))) continue;
		if (rule.excludedOptions && enabledBooleanOption(ghArgs, rule.excludedOptions)) continue;
		return {
			severity: rule.severity,
			reasons: rule.reasons,
			requiresInteractiveApproval: rule.requiresInteractiveApproval,
		};
	}
	return null;
}

function analyzeGitHubCliSegment(seg: Token[]): RiskDetails | null {
	const risks = splitOnOps(seg, ["|", "|&", "&", "(", ")"])
		.map((commandTokens) => analyzeGitHubCliArgs(tokensToStrings(commandTokens)))
		.filter((risk): risk is RiskDetails => risk !== null);
	if (risks.length === 0) return null;
	return {
		severity: risks.some((risk) => risk.severity === "high") ? "high" : "medium",
		reasons: risks.flatMap((risk) => risk.reasons),
		requiresInteractiveApproval: risks.some((risk) => risk.requiresInteractiveApproval),
	};
}

function analyzeGitLabCliArgs(rawArgs: string[]): RiskDetails | null {
	const args = unwrapShellCommand(rawArgs);
	if (args[0] !== "glab" && !args[0]?.endsWith("/glab")) return null;
	const glabArgs = args.slice(1);
	const commandArgs = withoutHostedCliContextOptions(glabArgs);
	if (commandArgs[0] === "api") return analyzeGitLabApi(commandArgs.slice(1));

	if (commandArgs[0] === "pipe" || commandArgs[0] === "pipeline") commandArgs[0] = "ci";
	const dynamicCommandRisk = analyzeDynamicHostedCliCommand(commandArgs, DANGEROUS_GITLAB_CLI_RULES, "glab");
	if (dynamicCommandRisk) return dynamicCommandRisk;
	for (const rule of DANGEROUS_GITLAB_CLI_RULES) {
		if (!rule.command.every((part, index) => commandArgs[index] === part)) continue;
		if (rule.anyOptions && !rule.anyOptions.some((option) => hasOption(glabArgs, option))) continue;
		if (rule.excludedOptions && enabledBooleanOption(glabArgs, rule.excludedOptions)) continue;
		return {
			severity: rule.severity,
			reasons: rule.reasons,
			requiresInteractiveApproval: rule.requiresInteractiveApproval,
		};
	}
	return null;
}

function analyzeGitLabCliSegment(seg: Token[]): RiskDetails | null {
	const risks = splitOnOps(seg, ["|", "|&", "&", "(", ")"])
		.map((commandTokens) => analyzeGitLabCliArgs(tokensToStrings(commandTokens)))
		.filter((risk): risk is RiskDetails => risk !== null);
	if (risks.length === 0) return null;
	return {
		severity: risks.some((risk) => risk.severity === "high") ? "high" : "medium",
		reasons: risks.flatMap((risk) => risk.reasons),
		requiresInteractiveApproval: risks.some((risk) => risk.requiresInteractiveApproval),
	};
}

function matchesCommandToken(arg: string | undefined, token: CommandToken): boolean {
	if (arg === undefined) return false;
	if (typeof token === "string") return arg === token;
	if ("prefix" in token) return arg.startsWith(token.prefix);
	return token.includes(arg);
}

function matchesArgCondition(args: string[], condition: ArgCondition): boolean {
	if ("hasArg" in condition) return args.includes(condition.hasArg);
	if ("argContains" in condition) {
		const fragment = condition.argContains;
		return args.some((arg) => arg.includes(fragment));
	}
	if ("argStartsWith" in condition) return anyArgStartsWith(args, condition.argStartsWith);
	if ("anyOf" in condition) return condition.anyOf.some((nested) => matchesArgCondition(args, nested));
	return condition.allOf.every((nested) => matchesArgCondition(args, nested));
}

const HEADLESS_GIT_WRAPPERS = new Set(["nohup", "time", "xargs"]);

function headlessGitCandidates(args: string[]): string[][] {
	const unwrapped = unwrapShellCommand(args);
	const candidates = gitCommandCandidates(unwrapped);
	const wrapper = unwrapped[0]?.split("/").at(-1);
	if (!wrapper || !HEADLESS_GIT_WRAPPERS.has(wrapper)) return candidates;

	const wrappedArgs = unwrapped.slice(1);
	const executable = wrappedArgs[0];
	if (executable === "git" || executable?.endsWith("/git")) {
		candidates.push(...gitCommandCandidates(wrappedArgs));
	}
	return candidates;
}

function headlessGitCommandCandidates(tokens: Token[]): string[][] {
	const candidates: string[][] = [];
	for (const segment of splitOnOps(tokens, ["&&", "||", ";"])) {
		for (const commandTokens of splitOnOps(segment, ["|", "|&", "&", "(", ")"])) {
			const args = tokensToStrings(commandTokens);
			candidates.push(...headlessGitCandidates(args));

			const nested = nestedShellCommand(args);
			if (!nested || isDynamicShellToken(nested)) continue;
			try {
				candidates.push(...headlessGitCommandCandidates(parseShellCommand(nested)));
			} catch {
				// An invalid nested command cannot execute and has no parsed candidate.
			}
		}
	}
	return candidates;
}

function matchesHeadlessGitRule(args: string[], rule: HeadlessGitRule): boolean {
	if (!rule.command.every((token, index) => matchesCommandToken(args[index], token))) return false;
	return !rule.when || matchesArgCondition(args.slice(rule.command.length), rule.when);
}

export function analyzeHeadlessGitCommand(command: string): string | null {
	let candidates: string[][] = [];
	try {
		candidates = headlessGitCommandCandidates(parseShellCommand(command));
	} catch {
		// Raw matching still preserves the former coverage for unparseable commands.
	}
	for (const rule of HEADLESS_GIT_BLOCKED) {
		if (rule.pattern.test(command) || candidates.some((args) => matchesHeadlessGitRule(args, rule))) {
			return rule.reason;
		}
	}
	return null;
}

// Conditions apply to the arguments that follow the matched command pattern.
function analyzeLocalCommandRule(args: string[], rule: LocalCommandRule): RiskDetails | null {
	if (!matchesCommandToken(args[0], rule.command[0])) return null;
	for (let index = 1; index < rule.command.length; index++) {
		if (matchesCommandToken(args[index], rule.command[index])) continue;
		if (!isDynamicShellToken(args[index])) return null;
		return {
			severity: rule.severity,
			reasons: [`${args[0]} dynamic subcommand (may resolve to a guarded local operation)`],
			requiresInteractiveApproval: rule.requiresInteractiveApproval,
		};
	}
	if (rule.when && !matchesArgCondition(args.slice(rule.command.length), rule.when)) return null;
	return {
		severity: rule.severity,
		reasons: [rule.reason.replace("{command}", args[0])],
		requiresInteractiveApproval: rule.requiresInteractiveApproval,
	};
}

const PIPE_TARGET_SHELLS = ["sh", "bash", "zsh", "fish"];

function analyzeNestedShellCommands(seg: Token[]): RiskDetails | null {
	const risks: RiskDetails[] = [];
	for (const commandTokens of splitOnOps(seg, ["|", "|&", "&", "(", ")"])) {
		const nested = nestedShellCommand(tokensToStrings(commandTokens));
		if (!nested) continue;
		if (isDynamicShellToken(nested)) {
			risks.push({
				severity: "high",
				reasons: ["dynamic nested shell command (may resolve to a guarded publication operation)"],
				requiresInteractiveApproval: true,
			});
			continue;
		}
		const risk = analyzeBashCommand(nested);
		if (risk) risks.push(risk);
	}
	if (risks.length === 0) return null;
	return {
		severity: risks.some((risk) => risk.severity === "high") ? "high" : "medium",
		reasons: risks.flatMap((risk) => risk.reasons),
		requiresInteractiveApproval: risks.some((risk) => risk.requiresInteractiveApproval),
	};
}

// Pipe to a shell: needs a pipe operator and a shell name anywhere in the segment.
function analyzePipeToShell(args: string[], ops: string[]): RiskDetails | null {
	if (!ops.includes("|") || !args.some((arg) => PIPE_TARGET_SHELLS.includes(arg))) return null;
	return { severity: "high", reasons: ["pipe to a shell (possible remote code execution)"] };
}

// rm/rmdir/unlink: one base reason plus up to three accumulated sub-reasons.
function analyzeFileDeletion(cmd: string, rest: string[], ops: string[]): RiskDetails | null {
	if (cmd !== "rm" && cmd !== "rmdir" && cmd !== "unlink") return null;
	const reasons = [`${cmd} (file deletion)`];
	if (rest.some((a) => a.includes("-r") || a.includes("-R"))) reasons.push("recursive delete (-r/-R)");
	if (rest.some((a) => a.includes("-f"))) reasons.push("forced delete (-f)");
	if (ops.includes("glob")) reasons.push("glob pattern expansion (may delete many files)");
	return { severity: "high", reasons };
}

// diskutil: base reason plus an additive erase reason, kept together so their order is local.
function analyzeDiskutil(cmd: string, rest: string[]): RiskDetails | null {
	if (cmd !== "diskutil") return null;
	const reasons = ["diskutil (disk management command)"];
	if (rest.includes("eraseDisk") || rest.includes("eraseVolume")) {
		reasons.push("diskutil erase (destructive disk operation)");
	}
	return { severity: "high", reasons };
}

// curl/wget feeding a pipeline: the command alone is not enough, the operator matters.
function analyzeDownloadPipe(cmd: string, ops: string[]): RiskDetails | null {
	if ((cmd !== "curl" && cmd !== "wget") || !ops.includes("|")) return null;
	return { severity: "high", reasons: ["curl/wget piped (possible remote code execution)"] };
}

function analyzeSystemPathRedirect(seg: Token[]): RiskDetails | null {
	const systemTarget = redirectsToSystemPath(seg);
	if (!systemTarget) return null;
	return { severity: "high", reasons: [`output redirected to system path: ${systemTarget}`] };
}

function analyzeSegment(seg: Token[]): RiskDetails | null {
	const reasons: string[] = [];
	let severity: Severity = "medium";
	let requiresInteractiveApproval = false;

	const ops = seg.filter(isOpToken).map((o) => o.op);
	const args = tokensToStrings(seg);
	if (args.length === 0) return null;

	const cmd = args[0];
	const rest = args.slice(1);

	// Severity only ever escalates: the worst matching rule wins.
	const apply = (risk: RiskDetails | null) => {
		if (!risk) return;
		reasons.push(...risk.reasons);
		if (risk.severity === "high") severity = "high";
		if (risk.requiresInteractiveApproval) requiresInteractiveApproval = true;
	};

	// This sequence is the reason order users see, so it is explicit and ordered.
	// The policy-table pass sits between the shell-operator detectors and the
	// multi-reason detectors; no policy rule names a detector command, so one pass
	// cannot interleave with detector reasons.
	apply(analyzeGitHubCliSegment(seg));
	apply(analyzeGitLabCliSegment(seg));
	apply(analyzeSystemPathRedirect(seg));
	apply(analyzePipeToShell(args, ops));
	apply(analyzeNestedShellCommands(seg));
	const localCommands = splitOnOps(seg, ["|", "|&", "&", "(", ")"])
		.flatMap((tokens) => gitCommandCandidates(unwrapShellCommand(tokensToStrings(tokens))))
		.filter((commandArgs) => commandArgs.length > 0);
	for (const rule of RISKY_LOCAL_COMMANDS) {
		for (const commandArgs of localCommands) apply(analyzeLocalCommandRule(commandArgs, rule));
	}
	apply(analyzeFileDeletion(cmd, rest, ops));
	apply(analyzeDiskutil(cmd, rest));
	apply(analyzeDownloadPipe(cmd, ops));

	if (reasons.length === 0) return null;
	return { severity, reasons, requiresInteractiveApproval };
}

function redirectsToSystemPath(tokens: Token[]): string | null {
	const redirectOps = new Set([">", ">>", "2>", "2>>"]);
	for (let i = 0; i < tokens.length - 1; i++) {
		const t = tokens[i];
		if (!isOpToken(t) || !redirectOps.has(t.op)) continue;
		const next = tokens[i + 1];
		if (typeof next !== "string") continue;
		if (SAFE_DEV_PATHS.has(next)) continue;
		if (SYSTEM_PATH_PREFIXES.some((p) => next.startsWith(p))) return next;
	}
	return null;
}

function analyzeParsedCommand(tokens: Token[], segmentAnalyzer: (segment: Token[]) => RiskDetails | null): Risk | null {
	const reasons: string[] = [];
	const flaggedCommands: string[] = [];
	let severity: Severity = "medium";
	let requiresInteractiveApproval = false;

	// Segment analysis (split on &&, ||, ;)
	const segments = splitOnOps(tokens, ["&&", "||", ";"]);
	for (const seg of segments) {
		const segRisk = segmentAnalyzer(seg);
		if (!segRisk) continue;
		if (segRisk.severity === "high") severity = "high";
		if (segRisk.requiresInteractiveApproval) requiresInteractiveApproval = true;
		for (const r of segRisk.reasons) reasons.push(r);
		flaggedCommands.push(formatSegment(seg));
	}

	// De-duplicate reasons and flagged command segments.
	const uniq = [...new Set(reasons)];
	if (uniq.length === 0) return null;
	return {
		severity,
		reasons: uniq,
		flaggedCommands: [...new Set(flaggedCommands)],
		requiresInteractiveApproval,
	};
}

export function analyzeBashCommand(command: string): Risk | null {
	let tokens: Token[];
	try {
		tokens = parseShellCommand(command);
	} catch {
		// Fallback: if we can't parse, treat the full command as questionable.
		return {
			severity: "medium",
			reasons: ["unparsed shell command (unable to analyze safely)"],
			flaggedCommands: [command],
			requiresInteractiveApproval: false,
		};
	}
	return analyzeParsedCommand(tokens, analyzeSegment);
}

export function analyzeGitHubCliCommand(command: string): Risk | null {
	try {
		return analyzeParsedCommand(parseShellCommand(command), analyzeGitHubCliSegment);
	} catch {
		return null;
	}
}

export function analyzeGitLabCliCommand(command: string): Risk | null {
	try {
		return analyzeParsedCommand(parseShellCommand(command), analyzeGitLabCliSegment);
	} catch {
		return null;
	}
}
