import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type NotificationProtocol = "iterm" | "kitty" | "osc777";

type Environment = Readonly<Record<string, string | undefined>>;

interface TerminalNotifyOptions {
	env?: Environment;
	write?: (value: string) => unknown;
}

const TITLE = "Pi";
const BODY = "Ready for input";

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

export function notificationSequence(protocol: NotificationProtocol): string {
	switch (protocol) {
		case "iterm":
			return `\x1b]9;${TITLE}: ${BODY}\x1b\\`;
		case "kitty":
			return `\x1b]99;i=pi:d=0;${TITLE}\x1b\\\x1b]99;i=pi:p=body;${BODY}\x1b\\`;
		case "osc777":
			return `\x1b]777;notify;${TITLE};${BODY}\x07`;
	}
}

export function createTerminalNotifyExtension(options: TerminalNotifyOptions = {}) {
	const env = options.env ?? process.env;
	const write = options.write ?? ((value: string) => process.stdout.write(value));

	return function terminalNotify(pi: ExtensionAPI): void {
		pi.on("agent_settled", (_event, ctx) => {
			if (ctx.mode !== "tui") return;
			const protocol = detectNotificationProtocol(env);
			if (!protocol) return;
			write(notificationSequence(protocol));
		});
	};
}

export default createTerminalNotifyExtension();
