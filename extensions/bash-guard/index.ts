import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import { parse as shellParse, quote as shellQuote } from "shell-quote";

import { TERMINAL_NOTIFY_EVENT, type TerminalNotificationRequest } from "../terminal-notify.ts";

export type Severity = "high" | "medium";

type RiskDetails = {
	severity: Severity;
	reasons: string[];
};

export type Risk = RiskDetails & {
	flaggedCommands: string[];
};

type OpToken = { op: string; [k: string]: unknown };
type CommentToken = { comment: string };

type Token = string | OpToken | CommentToken;

function parseShellCommand(command: string): Token[] {
	// Preserve environment references so policy checks can distinguish dynamic
	// arguments from literal empty strings without expanding user data.
	return shellParse(command, (name) => `$${name}`) as Token[];
}

function isOpToken(t: Token): t is OpToken {
	return typeof t === "object" && t !== null && "op" in t;
}

function tokensToStrings(tokens: Token[]): string[] {
	return tokens.filter((t) => typeof t === "string") as string[];
}

function splitOnOps(tokens: Token[], splitOps: string[]): Token[][] {
	const out: Token[][] = [];
	let current: Token[] = [];
	for (const t of tokens) {
		if (isOpToken(t) && splitOps.includes(t.op)) {
			if (current.length) out.push(current);
			current = [];
			continue;
		}
		current.push(t);
	}
	if (current.length) out.push(current);
	return out;
}

function formatSegment(tokens: Token[]): string {
	return tokens
		.map((token) => {
			if (typeof token === "string") {
				return /^[A-Za-z0-9_@%+=:,./-]+$/.test(token) ? token : shellQuote([token]);
			}
			if (isOpToken(token)) {
				return token.op === "glob" && typeof token.pattern === "string" ? token.pattern : token.op;
			}
			return `#${token.comment}`;
		})
		.join(" ");
}

function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag) || args.some((a) => a.startsWith(flag) && flag.length === 2 && a.startsWith("-"));
}

function anyArgStartsWith(args: string[], prefix: string): boolean {
	return args.some((a) => a.startsWith(prefix));
}

function hasOption(args: string[], option: string): boolean {
	return args.some((arg) => arg === option || (option.startsWith("--") && arg.startsWith(`${option}=`)));
}

function isDynamicShellToken(value: string | undefined): boolean {
	return value === "$" || value?.includes("$(") === true || value?.includes("`") === true || /^\$[A-Za-z_]/.test(value ?? "");
}

function enabledBooleanOption(args: string[], options: readonly string[]): boolean {
	let enabled: boolean | undefined;
	for (const arg of args) {
		for (const option of options) {
			if (arg === option) {
				enabled = true;
				continue;
			}
			if (!arg.startsWith(`${option}=`)) continue;
			const value = arg.slice(option.length + 1).toLowerCase();
			enabled = ["1", "t", "true"].includes(value) ? true : ["0", "f", "false"].includes(value) ? false : undefined;
		}
	}
	return enabled === true;
}

type HostedCliRule = RiskDetails & {
	command: readonly string[];
	anyOptions?: readonly string[];
	excludedOptions?: readonly string[];
};

// Keep this policy narrow: ordinary GitHub writes such as creating issues, editing
// descriptions, and posting comments are intentionally not guarded.
const DANGEROUS_GITHUB_CLI_COMMANDS: readonly HostedCliRule[] = [
	{ command: ["repo", "delete"], severity: "high", reasons: ["gh repo delete (repository deletion)"] },
	{ command: ["repo", "archive"], severity: "high", reasons: ["gh repo archive (repository archival)"] },
	{ command: ["repo", "rename"], severity: "high", reasons: ["gh repo rename (repository identity change)"] },
	{
		command: ["repo", "edit"],
		anyOptions: ["--visibility"],
		severity: "high",
		reasons: ["gh repo edit --visibility (repository visibility change)"],
	},
	{
		command: ["repo", "sync"],
		anyOptions: ["--force"],
		severity: "high",
		reasons: ["gh repo sync --force (remote branch overwrite)"],
	},
	{ command: ["repo", "deploy-key", "add"], severity: "high", reasons: ["gh repo deploy-key add (repository access change)"] },
	{ command: ["repo", "deploy-key", "delete"], severity: "high", reasons: ["gh repo deploy-key delete (repository access change)"] },
	{ command: ["repo", "autolink", "delete"], severity: "high", reasons: ["gh repo autolink delete (autolink deletion)"] },
	{
		command: ["pr", "merge"],
		excludedOptions: ["--disable-auto"],
		severity: "high",
		reasons: ["gh pr merge (pull request merge)"],
	},
	{ command: ["pr", "close"], severity: "medium", reasons: ["gh pr close (pull request closure)"] },
	{ command: ["pr", "revert"], severity: "high", reasons: ["gh pr revert (remote history change)"] },
	{ command: ["issue", "close"], severity: "medium", reasons: ["gh issue close (issue closure)"] },
	{ command: ["issue", "delete"], severity: "high", reasons: ["gh issue delete (issue deletion)"] },
	{ command: ["issue", "transfer"], severity: "high", reasons: ["gh issue transfer (issue ownership change)"] },
	{ command: ["release", "delete"], severity: "high", reasons: ["gh release delete (release deletion)"] },
	{ command: ["release", "delete-asset"], severity: "high", reasons: ["gh release delete-asset (release asset deletion)"] },
	{ command: ["workflow", "disable"], severity: "high", reasons: ["gh workflow disable (workflow disruption)"] },
	{ command: ["workflow", "run"], severity: "medium", reasons: ["gh workflow run (remote workflow execution)"] },
	{ command: ["run", "cancel"], severity: "medium", reasons: ["gh run cancel (workflow run cancellation)"] },
	{ command: ["run", "delete"], severity: "high", reasons: ["gh run delete (workflow run deletion)"] },
	{ command: ["run", "rerun"], severity: "medium", reasons: ["gh run rerun (remote workflow execution)"] },
	{ command: ["cache", "delete"], severity: "high", reasons: ["gh cache delete (Actions cache deletion)"] },
	{ command: ["secret", "set"], severity: "high", reasons: ["gh secret set (secret configuration change)"] },
	{ command: ["secret", "delete"], severity: "high", reasons: ["gh secret delete (secret configuration change)"] },
	{ command: ["variable", "set"], severity: "high", reasons: ["gh variable set (Actions configuration change)"] },
	{ command: ["variable", "delete"], severity: "high", reasons: ["gh variable delete (Actions configuration change)"] },
	{ command: ["ssh-key", "add"], severity: "high", reasons: ["gh ssh-key add (account access change)"] },
	{ command: ["ssh-key", "delete"], severity: "high", reasons: ["gh ssh-key delete (account access change)"] },
	{ command: ["gpg-key", "add"], severity: "high", reasons: ["gh gpg-key add (account signing-key change)"] },
	{ command: ["gpg-key", "delete"], severity: "high", reasons: ["gh gpg-key delete (account signing-key change)"] },
	{ command: ["project", "close"], severity: "medium", reasons: ["gh project close (project closure)"] },
	{ command: ["project", "delete"], severity: "high", reasons: ["gh project delete (project deletion)"] },
	{ command: ["project", "field-delete"], severity: "high", reasons: ["gh project field-delete (project field deletion)"] },
	{ command: ["project", "item-archive"], severity: "medium", reasons: ["gh project item-archive (project item archival)"] },
	{ command: ["project", "item-delete"], severity: "high", reasons: ["gh project item-delete (project item deletion)"] },
	{ command: ["gist", "delete"], severity: "high", reasons: ["gh gist delete (gist deletion)"] },
	{ command: ["codespace", "delete"], severity: "high", reasons: ["gh codespace delete (codespace deletion)"] },
	{ command: ["label", "delete"], severity: "high", reasons: ["gh label delete (repository label deletion)"] },
];

// Mirror the GitHub policy for GitLab while covering GitLab-specific CI schedules,
// access credentials, and destructive project operations. Ordinary writes such as
// creating issues, posting notes, and approving merge requests remain unguarded.
const DANGEROUS_GITLAB_CLI_COMMANDS: readonly HostedCliRule[] = [
	{ command: ["repo", "delete"], severity: "high", reasons: ["glab repo delete (project deletion)"] },
	{ command: ["repo", "transfer"], severity: "high", reasons: ["glab repo transfer (project ownership change)"] },
	{ command: ["repo", "mirror"], severity: "high", reasons: ["glab repo mirror (repository mirroring change)"] },
	{
		command: ["repo", "update"],
		anyOptions: ["--archive"],
		severity: "high",
		reasons: ["glab repo update --archive (project archival state change)"],
	},
	{
		command: ["repo", "update"],
		anyOptions: ["--defaultBranch"],
		severity: "high",
		reasons: ["glab repo update --defaultBranch (default branch change)"],
	},
	{ command: ["repo", "members", "add"], severity: "high", reasons: ["glab repo members add (project access change)"] },
	{ command: ["repo", "members", "remove"], severity: "high", reasons: ["glab repo members remove (project access change)"] },
	{ command: ["repo", "publish", "catalog"], severity: "high", reasons: ["glab repo publish catalog (catalog publication)"] },
	{ command: ["mr", "merge"], severity: "high", reasons: ["glab mr merge (merge request merge)"] },
	{ command: ["mr", "accept"], severity: "high", reasons: ["glab mr accept (merge request merge)"] },
	{ command: ["mr", "close"], severity: "medium", reasons: ["glab mr close (merge request closure)"] },
	{ command: ["mr", "delete"], severity: "high", reasons: ["glab mr delete (merge request deletion)"] },
	{ command: ["mr", "del"], severity: "high", reasons: ["glab mr del (merge request deletion)"] },
	{ command: ["mr", "rebase"], severity: "high", reasons: ["glab mr rebase (remote source branch rewrite)"] },
	{ command: ["mr", "note", "delete"], severity: "high", reasons: ["glab mr note delete (merge request note deletion)"] },
	{ command: ["issue", "close"], severity: "medium", reasons: ["glab issue close (issue closure)"] },
	{ command: ["issue", "delete"], severity: "high", reasons: ["glab issue delete (issue deletion)"] },
	{ command: ["issue", "del"], severity: "high", reasons: ["glab issue del (issue deletion)"] },
	{ command: ["incident", "close"], severity: "medium", reasons: ["glab incident close (incident closure)"] },
	{ command: ["work-items", "delete"], severity: "high", reasons: ["glab work-items delete (work item deletion)"] },
	{ command: ["release", "delete"], severity: "high", reasons: ["glab release delete (release deletion)"] },
	{
		command: ["ci", "cancel"],
		excludedOptions: ["--dry-run"],
		severity: "medium",
		reasons: ["glab ci cancel (pipeline or job cancellation)"],
	},
	{
		command: ["ci", "delete"],
		excludedOptions: ["--dry-run"],
		severity: "high",
		reasons: ["glab ci delete (pipeline deletion)"],
	},
	{
		command: ["ci", "run"],
		excludedOptions: ["-w", "--web"],
		severity: "medium",
		reasons: ["glab ci run (remote pipeline execution)"],
	},
	{ command: ["ci", "run-trig"], severity: "medium", reasons: ["glab ci run-trig (remote pipeline execution)"] },
	{ command: ["ci", "retry"], severity: "medium", reasons: ["glab ci retry (remote job execution)"] },
	{ command: ["ci", "trigger"], severity: "medium", reasons: ["glab ci trigger (remote job execution)"] },
	{ command: ["schedule", "create"], severity: "high", reasons: ["glab schedule create (recurring pipeline configuration)"] },
	{ command: ["schedule", "delete"], severity: "high", reasons: ["glab schedule delete (pipeline schedule deletion)"] },
	{
		command: ["schedule", "update"],
		anyOptions: [
			"--active",
			"--cron",
			"--cronTimeZone",
			"--ref",
			"--create-variable",
			"--update-variable",
			"--delete-variable",
		],
		severity: "high",
		reasons: ["glab schedule update (recurring pipeline configuration change)"],
	},
	{ command: ["schedule", "run"], severity: "medium", reasons: ["glab schedule run (remote pipeline execution)"] },
	{ command: ["variable", "set"], severity: "high", reasons: ["glab variable set (CI/CD configuration change)"] },
	{ command: ["variable", "update"], severity: "high", reasons: ["glab variable update (CI/CD configuration change)"] },
	{ command: ["variable", "delete"], severity: "high", reasons: ["glab variable delete (CI/CD configuration change)"] },
	{ command: ["deploy-key", "add"], severity: "high", reasons: ["glab deploy-key add (project access change)"] },
	{ command: ["deploy-key", "delete"], severity: "high", reasons: ["glab deploy-key delete (project access change)"] },
	{ command: ["ssh-key", "add"], severity: "high", reasons: ["glab ssh-key add (account access change)"] },
	{ command: ["ssh-key", "delete"], severity: "high", reasons: ["glab ssh-key delete (account access change)"] },
	{ command: ["gpg-key", "add"], severity: "high", reasons: ["glab gpg-key add (account signing-key change)"] },
	{ command: ["gpg-key", "delete"], severity: "high", reasons: ["glab gpg-key delete (account signing-key change)"] },
	{ command: ["token", "create"], severity: "high", reasons: ["glab token create (access token creation)"] },
	{ command: ["token", "revoke"], severity: "high", reasons: ["glab token revoke (access token revocation)"] },
	{ command: ["token", "rm"], severity: "high", reasons: ["glab token rm (access token revocation)"] },
	{ command: ["token", "rotate"], severity: "high", reasons: ["glab token rotate (access token rotation)"] },
	{ command: ["securefile", "create"], severity: "high", reasons: ["glab securefile create (secure CI file upload)"] },
	{ command: ["securefile", "upload"], severity: "high", reasons: ["glab securefile upload (secure CI file upload)"] },
	{ command: ["securefile", "remove"], severity: "high", reasons: ["glab securefile remove (secure CI file deletion)"] },
	{ command: ["securefile", "delete"], severity: "high", reasons: ["glab securefile delete (secure CI file deletion)"] },
	{ command: ["securefile", "rm"], severity: "high", reasons: ["glab securefile rm (secure CI file deletion)"] },
	{ command: ["label", "delete"], severity: "high", reasons: ["glab label delete (project label deletion)"] },
	{ command: ["milestone", "delete"], severity: "high", reasons: ["glab milestone delete (milestone deletion)"] },
	{ command: ["runner", "assign"], severity: "high", reasons: ["glab runner assign (runner assignment change)"] },
	{ command: ["runner", "unassign"], severity: "high", reasons: ["glab runner unassign (runner assignment change)"] },
	{ command: ["runner", "delete"], severity: "high", reasons: ["glab runner delete (runner deletion)"] },
	{
		command: ["runner", "update"],
		anyOptions: ["--pause"],
		severity: "medium",
		reasons: ["glab runner update --pause (runner disruption)"],
	},
	{ command: ["cluster", "agent", "bootstrap"], severity: "high", reasons: ["glab cluster agent bootstrap (cluster and repository mutation)"] },
	{ command: ["cluster", "agent", "get-token"], severity: "high", reasons: ["glab cluster agent get-token (access token creation)"] },
	{ command: ["cluster", "agent", "token", "revoke"], severity: "high", reasons: ["glab cluster agent token revoke (agent token revocation)"] },
	{ command: ["cluster", "agent", "token-cache", "clear"], severity: "high", reasons: ["glab cluster agent token-cache clear (cached token revocation)"] },
	{ command: ["opentofu", "state", "delete"], severity: "high", reasons: ["glab opentofu state delete (infrastructure state deletion)"] },
	{ command: ["runner-controller", "create"], severity: "high", reasons: ["glab runner-controller create (runner infrastructure creation)"] },
	{ command: ["runner-controller", "delete"], severity: "high", reasons: ["glab runner-controller delete (runner controller deletion)"] },
	{
		command: ["runner-controller", "update"],
		anyOptions: ["--state"],
		severity: "high",
		reasons: ["glab runner-controller update --state (runner infrastructure state change)"],
	},
	{ command: ["runner-controller", "scope", "create"], severity: "high", reasons: ["glab runner-controller scope create (runner controller access change)"] },
	{ command: ["runner-controller", "scope", "delete"], severity: "high", reasons: ["glab runner-controller scope delete (runner controller access change)"] },
	{ command: ["runner-controller", "token", "create"], severity: "high", reasons: ["glab runner-controller token create (access token creation)"] },
	{ command: ["runner-controller", "token", "revoke"], severity: "high", reasons: ["glab runner-controller token revoke (access token revocation)"] },
	{ command: ["runner-controller", "token", "rotate"], severity: "high", reasons: ["glab runner-controller token rotate (access token rotation)"] },
	{ command: ["changelog", "generate"], severity: "high", reasons: ["glab changelog generate (remote repository write)"] },
];

function optionValues(args: string[], shortOption: string, longOption: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === shortOption || arg === longOption) {
			if (i + 1 < args.length) values.push(args[i + 1]);
			continue;
		}
		if (arg.startsWith(`${longOption}=`)) {
			values.push(arg.slice(longOption.length + 1));
			continue;
		}
		if (arg.startsWith(shortOption) && !arg.startsWith("--") && arg.length > shortOption.length) {
			values.push(arg.slice(shortOption.length));
		}
	}
	return values;
}

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

const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function unwrapShellCommand(args: string[]): string[] {
	let index = 0;
	while (SHELL_ASSIGNMENT.test(args[index] ?? "")) index++;

	if (args[index] === "command") {
		index++;
		while (args[index] === "--" || args[index] === "-p") index++;
	} else if (args[index] === "env") {
		index++;
		while (index < args.length) {
			const arg = args[index];
			if (SHELL_ASSIGNMENT.test(arg) || arg === "--" || arg === "-i" || arg === "--ignore-environment") {
				index++;
				continue;
			}
			if (["-u", "--unset", "-C", "--chdir", "-S", "--split-string"].includes(arg)) {
				index += 2;
				continue;
			}
			break;
		}
	}

	return args.slice(index);
}

function withoutHostedCliContextOptions(args: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-R" || arg === "--repo" || arg === "--hostname") {
			i++;
			continue;
		}
		if (arg.startsWith("-R") || arg.startsWith("--repo=") || arg.startsWith("--hostname=")) continue;
		out.push(arg);
	}
	return out;
}

function analyzeDynamicHostedCliCommand(
	args: string[],
	rules: readonly HostedCliRule[],
	cli: "gh" | "glab",
): RiskDetails | null {
	for (const rule of rules) {
		for (let index = 0; index < rule.command.length; index++) {
			if (args[index] === rule.command[index]) continue;
			if (isDynamicShellToken(args[index])) {
				return {
					severity: "high",
					reasons: [`${cli} dynamic command or subcommand (may resolve to a guarded remote operation)`],
				};
			}
			break;
		}
	}
	return null;
}

function analyzeGitHubCliArgs(rawArgs: string[]): RiskDetails | null {
	const args = unwrapShellCommand(rawArgs);
	if (args[0] !== "gh" && !args[0]?.endsWith("/gh")) return null;
	const ghArgs = args.slice(1);
	const commandArgs = withoutHostedCliContextOptions(ghArgs);
	if (commandArgs[0] === "api") return analyzeGitHubApi(commandArgs.slice(1));

	const dynamicCommandRisk = analyzeDynamicHostedCliCommand(commandArgs, DANGEROUS_GITHUB_CLI_COMMANDS, "gh");
	if (dynamicCommandRisk) return dynamicCommandRisk;
	for (const rule of DANGEROUS_GITHUB_CLI_COMMANDS) {
		if (!rule.command.every((part, index) => commandArgs[index] === part)) continue;
		if (rule.anyOptions && !rule.anyOptions.some((option) => hasOption(ghArgs, option))) continue;
		if (rule.excludedOptions && enabledBooleanOption(ghArgs, rule.excludedOptions)) continue;
		return { severity: rule.severity, reasons: rule.reasons };
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
	};
}

function analyzeGitLabCliArgs(rawArgs: string[]): RiskDetails | null {
	const args = unwrapShellCommand(rawArgs);
	if (args[0] !== "glab" && !args[0]?.endsWith("/glab")) return null;
	const glabArgs = args.slice(1);
	const commandArgs = withoutHostedCliContextOptions(glabArgs);
	if (commandArgs[0] === "api") return analyzeGitLabApi(commandArgs.slice(1));

	if (commandArgs[0] === "pipe" || commandArgs[0] === "pipeline") commandArgs[0] = "ci";
	const dynamicCommandRisk = analyzeDynamicHostedCliCommand(commandArgs, DANGEROUS_GITLAB_CLI_COMMANDS, "glab");
	if (dynamicCommandRisk) return dynamicCommandRisk;
	for (const rule of DANGEROUS_GITLAB_CLI_COMMANDS) {
		if (!rule.command.every((part, index) => commandArgs[index] === part)) continue;
		if (rule.anyOptions && !rule.anyOptions.some((option) => hasOption(glabArgs, option))) continue;
		if (rule.excludedOptions && enabledBooleanOption(glabArgs, rule.excludedOptions)) continue;
		return { severity: rule.severity, reasons: rule.reasons };
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
	};
}

function analyzeSegment(seg: Token[]): RiskDetails | null {
	const reasons: string[] = [];
	let severity: Severity = "medium";

	const ops = seg.filter(isOpToken).map((o) => o.op);
	const args = tokensToStrings(seg);
	if (args.length === 0) return null;

	const cmd = args[0];
	const rest = args.slice(1);

	for (const hostedCliRisk of [analyzeGitHubCliSegment(seg), analyzeGitLabCliSegment(seg)]) {
		if (!hostedCliRisk) continue;
		reasons.push(...hostedCliRisk.reasons);
		if (hostedCliRisk.severity === "high") severity = "high";
	}

	const systemTarget = redirectsToSystemPath(seg);
	if (systemTarget) {
		reasons.push(`output redirected to system path: ${systemTarget}`);
		severity = "high";
	}

	// Shell pipe checks.
	if (ops.includes("|") && (args.includes("sh") || args.includes("bash") || args.includes("zsh") || args.includes("fish"))) {
		reasons.push("pipe to a shell (possible remote code execution)");
		severity = "high";
	}

	// sudo
	if (cmd === "sudo") {
		reasons.push("sudo (elevated privileges)");
		severity = "high";
	}

	// rm/rmdir/unlink
	if (cmd === "rm" || cmd === "rmdir" || cmd === "unlink") {
		severity = "high";
		reasons.push(`${cmd} (file deletion)`);
		if (rest.some((a) => a.includes("-r") || a.includes("-R"))) reasons.push("recursive delete (-r/-R)");
		if (rest.some((a) => a.includes("-f"))) reasons.push("forced delete (-f)");
		if (ops.includes("glob")) reasons.push("glob pattern expansion (may delete many files)");
	}

	// find -delete
	if (cmd === "find" && rest.includes("-delete")) {
		severity = "high";
		reasons.push("find -delete (bulk deletion)");
	}

	// git operations — only flag explicitly destructive subcommands
	if (cmd === "git") {
		const sub = rest[0];
		const subArgs = rest.slice(1);

		if (sub === "rm") {
			severity = "high";
			reasons.push("git rm (deletes files from working tree and stages deletions)");
		}
		if (sub === "clean" && (subArgs.some((a) => a.includes("-f")) || subArgs.includes("-d") || subArgs.includes("-x"))) {
			severity = "high";
			reasons.push("git clean (can delete untracked files)");
		}
		if (sub === "reset" && subArgs.includes("--hard")) {
			severity = "high";
			reasons.push("git reset --hard (discard changes)");
		}
		if ((sub === "checkout" || sub === "restore") && (subArgs.includes(".") || subArgs.includes("--") || subArgs.includes("--source"))) {
			severity = severity === "high" ? "high" : "medium";
			reasons.push("git checkout/restore (can overwrite working tree)");
		}
		if (sub === "push" && (subArgs.includes("--force") || subArgs.includes("--force-with-lease") || subArgs.includes("-f"))) {
			severity = "high";
			reasons.push("git push --force (rewrite remote history)");
		}
		if (sub === "reflog" && subArgs.includes("expire")) {
			severity = "high";
			reasons.push("git reflog expire (can remove recovery history)");
		}
		if (sub === "gc" && subArgs.some((a) => a.startsWith("--prune"))) {
			severity = "high";
			reasons.push("git gc --prune (can permanently delete objects)");
		}
	}

	// dd of=
	if (cmd === "dd" && (anyArgStartsWith(rest, "of=") || rest.includes("of"))) {
		severity = "high";
		reasons.push("dd with output file/device (can overwrite data)");
	}

	// Disk / volume management (prompt aggressively; high risk)
	// Linux: mkfs.*, wipefs, parted, fdisk, gdisk/sgdisk, lsblk, cryptsetup, LVM tools, zpool
	// macOS: diskutil, hdiutil, gpt, newfs_*, asr
	if (cmd.startsWith("mkfs")) {
		severity = "high";
		reasons.push("mkfs (filesystem formatting)");
	}
	if (cmd.startsWith("newfs_")) {
		severity = "high";
		reasons.push("newfs_* (filesystem formatting)");
	}
	if (cmd === "wipefs") {
		severity = "high";
		reasons.push("wipefs (disk signature wipe)");
	}
	if (cmd === "diskutil") {
		severity = "high";
		reasons.push("diskutil (disk management command)");
		if (rest.includes("eraseDisk") || rest.includes("eraseVolume")) {
			reasons.push("diskutil erase (destructive disk operation)");
		}
	}
	if (cmd === "hdiutil") {
		severity = "high";
		reasons.push("hdiutil (disk image management command)");
	}
	if (cmd === "gpt") {
		severity = "high";
		reasons.push("gpt (partition table manipulation)");
	}
	if (cmd === "asr") {
		severity = "high";
		reasons.push("asr (Apple Software Restore; can overwrite volumes)");
	}
	if (cmd === "parted" || cmd === "fdisk" || cmd === "gdisk" || cmd === "sgdisk") {
		severity = "high";
		reasons.push(`${cmd} (disk/partition management)`);
	}

	if (cmd === "cryptsetup") {
		severity = "high";
		reasons.push("cryptsetup (disk encryption management)");
	}
	if (cmd === "pvcreate" || cmd === "vgcreate" || cmd === "lvcreate") {
		severity = "high";
		reasons.push(`${cmd} (LVM volume management)`);
	}
	if (cmd === "zpool") {
		severity = "high";
		reasons.push("zpool (ZFS pool management)");
	}

	// chmod/chown recursive
	if (cmd === "chmod" && (rest.includes("-R") || rest.includes("--recursive"))) {
		severity = severity === "high" ? "high" : "medium";
		reasons.push("chmod -R (recursive permission changes)");
	}
	if (cmd === "chown" && (rest.includes("-R") || rest.includes("--recursive"))) {
		severity = severity === "high" ? "high" : "medium";
		reasons.push("chown -R (recursive ownership changes)");
	}

	// perl in-place
	if (cmd === "perl" && (rest.includes("-pi") || (rest.includes("-p") && rest.includes("-i")))) {
		severity = severity === "high" ? "high" : "medium";
		reasons.push("perl -pi/-i (in-place file modification)");
	}

	// kill — only flag SIGKILL (-9), routine process termination is normal
	if ((cmd === "kill" || cmd === "pkill" || cmd === "killall") && (rest.includes("-9") || rest.includes("-SIGKILL"))) {
		severity = "high";
		reasons.push(`${cmd} -9 (SIGKILL — force-kills processes)`);
	}
	if (cmd === "shutdown" || cmd === "reboot") {
		severity = "high";
		reasons.push(`${cmd} (system power operation)`);
	}
	if (cmd === "systemctl" && (rest.includes("stop") || rest.includes("disable"))) {
		severity = severity === "high" ? "high" : "medium";
		reasons.push("systemctl stop/disable (service disruption)");
	}

	// Remote execution patterns
	if ((cmd === "curl" || cmd === "wget") && ops.includes("|")) {
		severity = "high";
		reasons.push("curl/wget piped (possible remote code execution)");
	}

	// Infra deletes
	if (cmd === "kubectl" && rest[0] === "delete") {
		severity = "high";
		reasons.push("kubectl delete (resource deletion)");
	}
	if (cmd === "terraform" && rest[0] === "destroy") {
		severity = "high";
		reasons.push("terraform destroy (infrastructure teardown)");
	}
	if (cmd === "aws" && rest[0] === "s3" && rest[1] === "rm" && rest.includes("--recursive")) {
		severity = "high";
		reasons.push("aws s3 rm --recursive (bulk deletion)");
	}
	if (cmd === "gcloud" && rest.includes("delete")) {
		severity = "high";
		reasons.push("gcloud delete (resource deletion)");
	}

	if (reasons.length === 0) return null;
	return { severity, reasons };
}

const SYSTEM_PATH_PREFIXES = ["/dev/", "/etc/", "/sys/", "/proc/", "/boot/"];
const SAFE_DEV_PATHS = new Set(["/dev/null", "/dev/zero", "/dev/urandom", "/dev/stdin", "/dev/stdout", "/dev/stderr"]);

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

	// Segment analysis (split on &&, ||, ;)
	const segments = splitOnOps(tokens, ["&&", "||", ";"]);
	for (const seg of segments) {
		const segRisk = segmentAnalyzer(seg);
		if (!segRisk) continue;
		if (segRisk.severity === "high") severity = "high";
		for (const r of segRisk.reasons) reasons.push(r);
		flaggedCommands.push(formatSegment(seg));
	}

	// De-duplicate reasons and flagged command segments.
	const uniq = [...new Set(reasons)];
	if (uniq.length === 0) return null;
	return { severity, reasons: uniq, flaggedCommands: [...new Set(flaggedCommands)] };
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

async function promptRunOrAbort(ctx: any, command: string, risk: Risk): Promise<"run" | "abort"> {
	if (!ctx.hasUI) return "abort";

	const items: SelectItem[] = [
		{ value: "run", label: "Run", description: "Execute the command" },
		{ value: "abort", label: "Abort", description: "Block this command" },
	];

	const choice = await ctx.ui.custom<"run" | "abort">((tui, theme, _kb, done) => {
		const reasonsText = risk.reasons.map((reason) => `• ${reason}`).join("\n");
		const flaggedLabel = risk.flaggedCommands.length === 1 ? "Problematic command" : "Problematic commands";
		const flaggedText = risk.flaggedCommands
			.map((flaggedCommand) => theme.fg("error", theme.bold(`⚠ ${flaggedCommand}`)))
			.join("\n");
		const fullCommandText = command
			.split("\n")
			.map((line) => theme.fg("muted", line))
			.join("\n");
		const body = [
			theme.fg("warning", `Command flagged as ${risk.severity.toUpperCase()} risk`),
			"",
			`${theme.bold(`${flaggedLabel}:`)}\n${flaggedText}`,
			"",
			`${theme.bold("Reasons:")}\n${reasonsText}`,
			"",
			`${theme.bold("Full command:")}\n${fullCommandText}`,
		].join("\n");

		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));
		container.addChild(new Text(theme.fg("warning", theme.bold("Potentially destructive bash command")), 1, 0));
		container.addChild(new Text(body, 1, 0));

		const list = new SelectList(items, items.length, {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		});

		list.onSelect = (item) => done(item.value as "run" | "abort");
		list.onCancel = () => done("abort");
		container.addChild(list);

		container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	}, { overlay: true });

	return choice ?? "abort";
}

// PI_SUBAGENT_DEPTH is 0 (or unset) in the main session and >= 1 in spawned subagent processes.
// Behaviour branches on this: interactive prompting in the main session, headless hard-block
// for catastrophic operations in subagents (where stdin is /dev/null and no UI is available).
const _subagentDepth = Number(process.env.PI_SUBAGENT_DEPTH ?? "0");
const _isSubagent = Number.isFinite(_subagentDepth) && _subagentDepth >= 1;

// Hard-block patterns for subagent (headless) mode. Criteria: unrecoverable by default AND
// unlikely to be intentional in an automated context. Fewer false positives over broad coverage —
// the interactive prompt handles the rest for main sessions.
const HEADLESS_BLOCKED: Array<{ pattern: RegExp; reason: string }> = [
	// Recursive deletion
	{ pattern: /(?<!\bgit\s+)\brm\b[^#\n]*\s-(?:[a-zA-Z]*[rR]|-\brecursive\b)/, reason: "recursive delete (rm -r / -rf / -Rf)" },
	// Privilege escalation
	{ pattern: /\bsudo\b/, reason: "elevated privileges (sudo)" },
	// Remote code execution via pipe-to-shell
	{ pattern: /\b(curl|wget)\b[^#\n]*\|\s*(ba?sh|zsh|fish|dash|sh)\b/, reason: "pipe to shell (remote code execution)" },
	// Disk / filesystem destruction
	{ pattern: /\bmkfs/, reason: "filesystem formatting (mkfs)" },
	{ pattern: /\bnewfs_\w+/, reason: "filesystem formatting (newfs_*)" },
	{ pattern: /\bwipefs\b/, reason: "disk signature wipe" },
	{ pattern: /\bdiskutil\s+(erase|zeroDisk|secureErase|reformat)/i, reason: "destructive disk operation (diskutil)" },
	{ pattern: /\bdd\b[^#\n]*\bof=\/dev\//, reason: "raw disk write (dd of=/dev/...)" },
	{ pattern: /\b(parted|fdisk|gdisk|sgdisk)\b/, reason: "partition table management" },
	{ pattern: /\bcryptsetup\b/, reason: "disk encryption management" },
	{ pattern: /\bzpool\b/, reason: "ZFS pool management" },
	// System power
	{ pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "system power operation" },
	// Infrastructure teardown
	{ pattern: /\bterraform\s+destroy\b/, reason: "infrastructure teardown (terraform destroy)" },
	{ pattern: /\bkubectl\s+delete\b/, reason: "Kubernetes resource deletion" },
	{ pattern: /\baws\s+s3\s+rm\b[^#\n]*--recursive/, reason: "bulk S3 deletion (aws s3 rm --recursive)" },
	// Destructive git operations
	{ pattern: /\bgit\s+commit\b/, reason: "git commit (commits are main-session operations)" },
	{ pattern: /\bgit\s+pull\b/, reason: "git pull (pulls are main-session operations)" },
	{ pattern: /\bgit\s+push\b/, reason: "git push (pushes are main-session operations)" },
	{ pattern: /\bgit\s+reset\b[^#\n]*--hard\b/, reason: "discard all uncommitted changes (git reset --hard)" },
	{ pattern: /\bgit\s+clean\b[^#\n]*-[a-zA-Z]*f/, reason: "delete untracked files (git clean -f)" },
	{ pattern: /\bgit\s+reflog\s+expire\b/, reason: "expire reflog (removes recovery history)" },
	{ pattern: /\bgit\s+gc\b[^#\n]*--prune\b/, reason: "prune unreachable objects (git gc --prune)" },
];

export default function (pi: ExtensionAPI) {
	if (_isSubagent) {
		// Subagent mode: hard-block catastrophic operations, no prompting.
		pi.on("tool_call", async (event) => {
			if (!isToolCallEventType("bash", event)) return;
			const command = event.input.command;
			for (const [platform, hostedCliRisk] of [
				["GitHub", analyzeGitHubCliCommand(command)],
				["GitLab", analyzeGitLabCliCommand(command)],
			] as const) {
				if (!hostedCliRisk) continue;
				return {
					block: true,
					reason:
						`Blocked by bash-guard: ${hostedCliRisk.reasons.join("; ")}. ` +
						`This is a non-interactive subagent session — dangerous ${platform} operations are not permitted. ` +
						"Ask the parent agent to perform the operation with user approval.",
				};
			}
			for (const { pattern, reason } of HEADLESS_BLOCKED) {
				if (pattern.test(command)) {
					return {
						block: true,
						reason:
							`Blocked by bash-guard: ${reason}. ` +
							"This is a non-interactive subagent session — catastrophic operations are not permitted. " +
							"Propose a safer alternative or ask the parent agent to confirm with the user.",
					};
				}
			}
		});
		return;
	}

	// Main session mode: interactive prompting.
	pi.registerFlag("bash-guard-auto-allow", {
		description: "If set, bash-guard will not block when no UI is available (non-interactive modes).",
		type: "boolean",
		default: false,
	});

	// Avoid annoying retry loops: if the exact command was aborted recently, auto-block it.
	const recentlyAborted = new Map<string, number>();
	const ABORT_REMEMBER_MS = 60_000;

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		const command = event.input.command;
		const risk = analyzeBashCommand(command);
		if (!risk) return;

		const now = Date.now();
		const lastAbort = recentlyAborted.get(command);
		if (lastAbort && now - lastAbort < ABORT_REMEMBER_MS) {
			return {
				block: true,
				reason:
					"Blocked by bash-guard: command was already aborted recently. Ask the user for a safer alternative; do not retry the same command.",
			};
		}

		if (!ctx.hasUI && pi.getFlag("--bash-guard-auto-allow")) {
			// Non-interactive mode: allow when explicitly requested.
			return;
		}

		if (ctx.hasUI && ctx.mode === "tui") {
			const request: TerminalNotificationRequest = {
				mode: ctx.mode,
				body: `Bash approval required (${risk.severity} risk)`,
				ringBell: true,
			};
			pi.events.emit(TERMINAL_NOTIFY_EVENT, request);
		}

		const choice = await promptRunOrAbort(ctx, command, risk);
		if (choice === "run") return;

		recentlyAborted.set(command, now);
		return {
			block: true,
			reason:
				"Blocked by user via bash-guard (potentially destructive command). Ask the user for confirmation or propose a non-destructive alternative.",
		};
	});
}
