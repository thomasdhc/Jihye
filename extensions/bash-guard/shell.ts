/**
 * Shell syntax helpers for bash-guard.
 *
 * Purely syntactic: tokenizing commands, splitting on shell operators, and
 * reading options out of an argument list. Knows nothing about guard policy.
 */
import { parse as shellParse, quote as shellQuote } from "shell-quote";

export type OpToken = { op: string; [k: string]: unknown };
export type CommentToken = { comment: string };

export type Token = string | OpToken | CommentToken;

export function parseShellCommand(command: string): Token[] {
	// Preserve environment references so policy checks can distinguish dynamic
	// arguments from literal empty strings without expanding user data.
	return shellParse(command, (name) => `$${name}`) as Token[];
}

export function isOpToken(t: Token): t is OpToken {
	return typeof t === "object" && t !== null && "op" in t;
}

export function tokensToStrings(tokens: Token[]): string[] {
	return tokens.filter((t) => typeof t === "string") as string[];
}

export function splitOnOps(tokens: Token[], splitOps: string[]): Token[][] {
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

export function formatSegment(tokens: Token[]): string {
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

export function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag) || args.some((a) => a.startsWith(flag) && flag.length === 2 && a.startsWith("-"));
}

export function anyArgStartsWith(args: string[], prefix: string): boolean {
	return args.some((a) => a.startsWith(prefix));
}

export function hasOption(args: string[], option: string): boolean {
	return args.some((arg) => arg === option || (option.startsWith("--") && arg.startsWith(`${option}=`)));
}

export function isDynamicShellToken(value: string | undefined): boolean {
	return value === "$" || value?.includes("$(") === true || value?.includes("`") === true || /^\$[A-Za-z_]/.test(value ?? "");
}

export function enabledBooleanOption(args: string[], options: readonly string[]): boolean {
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

export function optionValues(args: string[], shortOption: string, longOption: string): string[] {
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

const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function unwrapShellCommand(args: string[]): string[] {
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

const COMMAND_SHELLS = new Set(["bash", "dash", "fish", "ksh", "sh", "zsh"]);

/** Return the static or dynamic command passed to a nested shell's `-c` option. */
export function nestedShellCommand(args: string[]): string | null {
	const unwrapped = unwrapShellCommand(args);
	const executable = unwrapped[0]?.split("/").at(-1);
	if (!executable || !COMMAND_SHELLS.has(executable)) return null;

	for (let index = 1; index < unwrapped.length; index++) {
		const arg = unwrapped[index];
		if (["-O", "+O", "-o", "+o", "--init-file", "--rcfile"].includes(arg)) {
			index++;
			continue;
		}
		if ((arg.startsWith("-O") || arg.startsWith("-o")) && arg.length > 2) continue;
		if (arg === "-c" || (/^-[^-]+$/.test(arg) && arg.includes("c"))) {
			return unwrapped[index + 1] ?? null;
		}
		if (arg === "--") return null;
		if (arg.startsWith("-") || arg.startsWith("+")) continue;
		return null;
	}
	return null;
}

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
	"-C",
	"-c",
	"--config-env",
	"--git-dir",
	"--namespace",
	"--super-prefix",
	"--work-tree",
]);
const GIT_GLOBAL_BOOLEAN_OPTIONS = new Set([
	"--bare",
	"--glob-pathspecs",
	"--icase-pathspecs",
	"--literal-pathspecs",
	"--no-lazy-fetch",
	"--no-optional-locks",
	"--no-advice",
	"--no-pager",
	"--no-replace-objects",
	"--noglob-pathspecs",
	"--paginate",
	"-p",
	"-P",
]);

/**
 * Expose plausible git subcommands after executable paths and global context options.
 *
 * Unknown global options are ambiguous: they may be boolean flags or consume the
 * following token. Preserve both interpretations so a new git option cannot hide
 * a guarded subcommand and make analysis fail open.
 */
export function gitCommandCandidates(args: string[]): string[][] {
	const executable = args[0];
	if (executable !== "git" && !executable?.endsWith("/git")) return [args];

	const pending = [1];
	const visited = new Set<number>();
	const candidates: string[][] = [];
	while (pending.length > 0) {
		const index = pending.shift()!;
		if (visited.has(index) || index >= args.length) continue;
		visited.add(index);

		const arg = args[index];
		if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(arg)) {
			pending.push(index + 2);
			continue;
		}
		if (
			(arg.startsWith("-C") || arg.startsWith("-c")) &&
			arg !== "-C" &&
			arg !== "-c"
		) {
			pending.push(index + 1);
			continue;
		}
		if (arg.startsWith("--") && arg.includes("=")) {
			pending.push(index + 1);
			continue;
		}
		if (GIT_GLOBAL_BOOLEAN_OPTIONS.has(arg)) {
			pending.push(index + 1);
			continue;
		}
		if (arg.startsWith("-")) {
			pending.push(index + 1);
			pending.push(index + 2);
			continue;
		}
		candidates.push(["git", ...args.slice(index)]);
	}

	return candidates;
}

export function withoutHostedCliContextOptions(args: string[]): string[] {
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
