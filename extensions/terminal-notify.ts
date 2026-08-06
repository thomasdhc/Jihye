import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getActiveSessionIdentity } from "../lib/session-identity.ts";

export type NotificationProtocol = "iterm" | "kitty" | "osc777";

export const TERMINAL_NOTIFY_EVENT = "terminal-notify:request";

export interface TerminalNotificationRequest {
	mode: string;
	title?: string;
	body: string;
	ringBell?: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

interface TerminalNotifyOptions {
	env?: Environment;
	write?: (value: string) => unknown;
}

const DEFAULT_TITLE = "Pi";
const DEFAULT_BODY = "Ready for input";
const TERMINAL_BELL = "\x07";

export function detectNotificationProtocol(env: Environment): NotificationProtocol | undefined {
	const configured = env.PI_TERMINAL_NOTIFY?.trim().toLowerCase();
	if (configured === "off") return undefined;
	if (configured === "iterm" || configured === "kitty" || configured === "osc777") {
		return configured;
	}
	if (configured === "tilix") return "osc777";

	if (env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty") return "kitty";
	if (env.TERM_PROGRAM === "iTerm.app") return "iterm";

	const termProgram = env.TERM_PROGRAM?.toLowerCase();
	if (
		env.TILIX_ID
		|| env.WEZTERM_PANE
		|| termProgram === "tilix"
		|| termProgram === "wezterm"
		|| termProgram === "ghostty"
	) {
		return "osc777";
	}

	return undefined;
}

export function notificationSequence(
	protocol: NotificationProtocol,
	title = DEFAULT_TITLE,
	body = DEFAULT_BODY,
): string {
	switch (protocol) {
		case "iterm":
			return `\x1b]9;${title}: ${body}\x1b\\`;
		case "kitty":
			return `\x1b]99;i=pi:d=0;${title}\x1b\\\x1b]99;i=pi:p=body;${body}\x1b\\`;
		case "osc777":
			return `\x1b]777;notify;${title};${body}\x07`;
	}
}

export function notificationRequestSequence(
	request: TerminalNotificationRequest,
	env: Environment,
	defaultTitle = DEFAULT_TITLE,
): string {
	if (request.mode !== "tui") return "";
	if (env.PI_TERMINAL_NOTIFY?.trim().toLowerCase() === "off") return "";

	const bell = request.ringBell ? TERMINAL_BELL : "";
	const protocol = detectNotificationProtocol(env);
	const title = request.title?.trim() || defaultTitle;
	const notification = protocol
		? notificationSequence(protocol, title, request.body)
		: "";
	return `${bell}${notification}`;
}

export function createTerminalNotifyExtension(options: TerminalNotifyOptions = {}) {
	const env = options.env ?? process.env;
	const write = options.write ?? ((value: string) => process.stdout.write(value));

	return function terminalNotify(pi: ExtensionAPI): void {
		pi.on("agent_settled", (_event, ctx) => {
			if (ctx.mode !== "tui") return;
			const protocol = detectNotificationProtocol(env);
			if (!protocol) return;
			write(notificationSequence(protocol, getActiveSessionIdentity() ?? DEFAULT_TITLE));
		});

		pi.events.on(TERMINAL_NOTIFY_EVENT, (data) => {
			const sequence = notificationRequestSequence(
				data as TerminalNotificationRequest,
				env,
				getActiveSessionIdentity() ?? DEFAULT_TITLE,
			);
			if (sequence) write(sequence);
		});
	};
}

export default createTerminalNotifyExtension();
