export const ENABLE_TERMINAL_FOCUS_REPORTING_SEQUENCE = "\x1b[?1004h";
export const DISABLE_TERMINAL_FOCUS_REPORTING_SEQUENCE = "\x1b[?1004l";
export const TERMINAL_FOCUS_IN_SEQUENCE = "\x1b[I";
export const TERMINAL_FOCUS_OUT_SEQUENCE = "\x1b[O";

export type TerminalEnvironment = Readonly<Record<string, string | undefined>>;

export function shouldEnableTerminalFocusReporting(
	environment: TerminalEnvironment = process.env,
): boolean {
	if (environment.TMUX || environment.STY) return false;
	return environment.TERM_PROGRAM?.toLowerCase() === "iterm.app"
		|| Boolean(environment.ITERM_SESSION_ID);
}

export interface ParsedTerminalFocusInput {
	focused: boolean;
	data: string;
}

export function parseTerminalFocusInput(data: string): ParsedTerminalFocusInput | undefined {
	let focused: boolean | undefined;
	const remaining = data.replace(/\x1b\[([IO])/g, (_sequence, state: string) => {
		focused = state === "I";
		return "";
	});
	return focused === undefined ? undefined : { focused, data: remaining };
}
