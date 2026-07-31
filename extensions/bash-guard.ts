import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ShellToken =
	| { kind: "word"; value: string }
	| { kind: "separator"; value: string };

export interface DestructiveMatch {
	command: "rm" | "rmdir" | "unlink" | "find -delete";
	reason: string;
}

// Keep this list deliberately small. Expand it only when a concrete use case
// warrants another approval rule.
const DESTRUCTIVE_COMMANDS = new Map<DestructiveMatch["command"], string>([
	["rm", "rm removes files or directories"],
	["rmdir", "rmdir removes directories"],
	["unlink", "unlink removes a filesystem entry"],
]);

const COMMAND_PREFIXES = new Set(["!", "if", "then", "elif", "else", "while", "until", "do", "time", "{"]);
const COMMAND_WRAPPERS = new Set(["builtin", "command", "env", "sudo"]);
const COMMAND_CONSUMERS = new Set(["xargs"]);

function tokenizeShell(command: string): ShellToken[] {
	const tokens: ShellToken[] = [];
	let word = "";
	let wordStarted = false;
	let quote: "'" | '"' | null = null;

	const flushWord = () => {
		if (wordStarted) tokens.push({ kind: "word", value: word });
		word = "";
		wordStarted = false;
	};

	for (let index = 0; index < command.length; index += 1) {
		const character = command[index]!;

		if (quote === "'") {
			if (character === "'") quote = null;
			else word += character;
			continue;
		}

		if (quote === '"') {
			if (character === '"') {
				quote = null;
			} else if (character === "\\" && index + 1 < command.length) {
				word += command[index + 1]!;
				index += 1;
			} else {
				word += character;
			}
			continue;
		}

		if (character === "\\" && index + 1 < command.length) {
			wordStarted = true;
			word += command[index + 1]!;
			index += 1;
			continue;
		}

		if (character === "'" || character === '"') {
			wordStarted = true;
			quote = character;
			continue;
		}

		if (character === "#" && !wordStarted) {
			while (index + 1 < command.length && command[index + 1] !== "\n") index += 1;
			continue;
		}

		if (/\s/.test(character)) {
			flushWord();
			if (character === "\n") tokens.push({ kind: "separator", value: character });
			continue;
		}

		if (";|&(){}\u0060".includes(character)) {
			flushWord();
			let operator = character;
			if ((character === ";" || character === "|" || character === "&") && command[index + 1] === character) {
				operator += character;
				index += 1;
			}
			tokens.push({ kind: "separator", value: operator });
			continue;
		}

		wordStarted = true;
		word += character;
	}

	flushWord();
	return tokens;
}

function executableName(token: string): string {
	return basename(token).toLowerCase();
}

function isAssignment(token: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function splitCommands(tokens: ShellToken[]): string[][] {
	const commands: string[][] = [];
	let current: string[] = [];

	for (const token of tokens) {
		if (token.kind === "separator") {
			if (current.length > 0) commands.push(current);
			current = [];
		} else {
			current.push(token.value);
		}
	}

	if (current.length > 0) commands.push(current);
	return commands;
}

function firstCommandIndex(words: string[]): number | undefined {
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index]!;
		if (COMMAND_PREFIXES.has(word.toLowerCase()) || isAssignment(word)) continue;
		return index;
	}
	return undefined;
}

function directMatch(word: string): DestructiveMatch | undefined {
	const name = executableName(word) as DestructiveMatch["command"];
	const reason = DESTRUCTIVE_COMMANDS.get(name);
	return reason ? { command: name, reason } : undefined;
}

function matchCommand(words: string[]): DestructiveMatch | undefined {
	const commandIndex = firstCommandIndex(words);
	if (commandIndex === undefined) return undefined;

	const commandName = executableName(words[commandIndex]!);
	const direct = directMatch(words[commandIndex]!);
	if (direct) return direct;

	if (commandName === "find" && words.slice(commandIndex + 1).includes("-delete")) {
		return { command: "find -delete", reason: "find -delete removes matched filesystem entries" };
	}

	if (commandName === "find") {
		for (let index = commandIndex + 1; index < words.length - 1; index += 1) {
			if (words[index] !== "-exec" && words[index] !== "-execdir") continue;
			const match = directMatch(words[index + 1]!);
			if (match) return match;
		}
	}

	if (COMMAND_WRAPPERS.has(commandName) || COMMAND_CONSUMERS.has(commandName)) {
		for (const word of words.slice(commandIndex + 1)) {
			const match = directMatch(word);
			if (match) return match;
		}
	}

	return undefined;
}

export function detectDestructiveCommand(command: string): DestructiveMatch | undefined {
	for (const words of splitCommands(tokenizeShell(command))) {
		const match = matchCommand(words);
		if (match) return match;
	}
	return undefined;
}

export default function bashGuard(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command;
		if (typeof command !== "string") {
			return { block: true, reason: "Bash guard could not inspect a non-string command" };
		}

		const match = detectDestructiveCommand(command);
		if (!match) return undefined;

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Bash guard blocked ${match.command}: manual approval is unavailable`,
			};
		}

		const approved = await ctx.ui.confirm(
			`Approve ${match.command}?`,
			`${match.reason}.\n\nWorking directory: ${ctx.cwd}\n\n${command}`,
		);

		if (!approved) {
			return { block: true, reason: `Bash guard: ${match.command} was not approved by the user` };
		}

		return undefined;
	});
}
