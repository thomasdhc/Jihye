import { execFile, spawn } from "node:child_process";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getActiveSessionIdentity } from "./widget/session-identity/state.ts";

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
	tilixNotificationsEnabled?: () => boolean | undefined | Promise<boolean | undefined>;
	notifyDesktop?: (title: string, body: string) => unknown;
}

const DEFAULT_TITLE = "Pi";
const DEFAULT_BODY = "Ready for input";
const TERMINAL_BELL = "\x07";

export function parseTilixNotificationsEnabled(output: string): boolean | undefined {
	const match = output.match(/Notifications enabled=(0|1|false|true)/i);
	if (!match) return undefined;
	return match[1] === "1" || match[1]?.toLowerCase() === "true";
}

function detectTilixNotificationsEnabled(): Promise<boolean | undefined> {
	return new Promise((resolve) => {
		execFile(
			"tilix",
			["--version"],
			{ encoding: "utf8", timeout: 2000 },
			(error, stdout) => resolve(error ? undefined : parseTilixNotificationsEnabled(stdout)),
		);
	});
}

export function desktopNotificationArguments(title: string, body: string): string[] {
	return ["--app-name=Jihye", "--", title, body];
}

function sendDesktopNotification(title: string, body: string): void {
	const child = spawn("notify-send", desktopNotificationArguments(title, body), {
		detached: true,
		stdio: "ignore",
	});
	child.on("error", () => {});
	child.unref();
}

function isTilixTarget(env: Environment): boolean {
	const configured = env.PI_TERMINAL_NOTIFY?.trim().toLowerCase();
	if (configured === "osc777") return false;
	return configured === "tilix" || Boolean(env.TILIX_ID) || env.TERM_PROGRAM?.toLowerCase() === "tilix";
}

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
	const tilixNotificationsEnabled = options.tilixNotificationsEnabled ?? detectTilixNotificationsEnabled;
	const notifyDesktop = options.notifyDesktop ?? sendDesktopNotification;
	let tilixNotificationsCheck: Promise<boolean | undefined> | undefined;

	function checkTilixNotifications(): Promise<boolean | undefined> {
		tilixNotificationsCheck ??= Promise.resolve()
			.then(tilixNotificationsEnabled)
			.catch(() => undefined);
		return tilixNotificationsCheck;
	}

	async function notify(title: string, body: string, ringBell = false): Promise<void> {
		if (env.PI_TERMINAL_NOTIFY?.trim().toLowerCase() === "off") return;
		const bell = ringBell ? TERMINAL_BELL : "";

		const protocol = detectNotificationProtocol(env);
		if (!protocol) {
			if (bell) write(bell);
			return;
		}

		if (protocol === "osc777" && isTilixTarget(env)) {
			const tilixSupportsNotifications = await checkTilixNotifications();
			if (tilixSupportsNotifications === false) {
				if (bell) write(bell);
				notifyDesktop(title, body);
				return;
			}
		}

		write(`${bell}${notificationSequence(protocol, title, body)}`);
	}

	return function terminalNotify(pi: ExtensionAPI): void {
		pi.on("session_start", (_event, ctx) => {
			if (
				ctx.mode === "tui"
				&& detectNotificationProtocol(env) === "osc777"
				&& isTilixTarget(env)
			) {
				void checkTilixNotifications();
			}
		});

		pi.on("agent_settled", async (_event, ctx) => {
			if (ctx.mode !== "tui") return;
			await notify(getActiveSessionIdentity() ?? DEFAULT_TITLE, DEFAULT_BODY);
		});

		pi.events.on(TERMINAL_NOTIFY_EVENT, async (data) => {
			const request = data as TerminalNotificationRequest;
			if (request.mode !== "tui") return;
			await notify(
				request.title?.trim() || getActiveSessionIdentity() || DEFAULT_TITLE,
				request.body,
				request.ringBell,
			);
		});
	};
}

export default createTerminalNotifyExtension();
