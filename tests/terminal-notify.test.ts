import assert from "node:assert/strict";
import test from "node:test";

import {
	createTerminalNotifyExtension,
	desktopNotificationArguments,
	detectNotificationProtocol,
	notificationRequestSequence,
	notificationSequence,
	parseTilixNotificationsEnabled,
	TERMINAL_NOTIFY_EVENT,
} from "../extensions/terminal-notify.ts";
import { setActiveSessionIdentity } from "../extensions/widget/session-identity/state.ts";

test("detects terminal notification protocols with explicit precedence", () => {
	assert.equal(detectNotificationProtocol({ KITTY_WINDOW_ID: "1", TERM_PROGRAM: "iTerm.app" }), "kitty");
	assert.equal(detectNotificationProtocol({ TERM: "xterm-kitty" }), "kitty");
	assert.equal(detectNotificationProtocol({ TERM_PROGRAM: "iTerm.app" }), "iterm");
	assert.equal(detectNotificationProtocol({ TILIX_ID: "session" }), "osc777");
	assert.equal(detectNotificationProtocol({ TERM_PROGRAM: "WezTerm" }), "osc777");
	assert.equal(detectNotificationProtocol({ TERM_PROGRAM: "ghostty" }), "osc777");
	assert.equal(detectNotificationProtocol({ VTE_VERSION: "7600" }), undefined);
	assert.equal(detectNotificationProtocol({}), undefined);
});

test("supports explicit protocol overrides and disabling", () => {
	assert.equal(detectNotificationProtocol({ PI_TERMINAL_NOTIFY: "tilix" }), "osc777");
	assert.equal(detectNotificationProtocol({ PI_TERMINAL_NOTIFY: "iterm", TILIX_ID: "session" }), "iterm");
	assert.equal(detectNotificationProtocol({ PI_TERMINAL_NOTIFY: "off", KITTY_WINDOW_ID: "1" }), undefined);
});

test("builds the expected terminal-native notification sequences", () => {
	assert.equal(notificationSequence("iterm"), "\x1b]9;Pi: Ready for input\x1b\\");
	assert.equal(
		notificationSequence("kitty"),
		"\x1b]99;i=pi:d=0;Pi\x1b\\\x1b]99;i=pi:p=body;Ready for input\x1b\\",
	);
	assert.equal(notificationSequence("osc777"), "\x1b]777;notify;Pi;Ready for input\x07");
});

test("passes dash-prefixed desktop notification content after the option terminator", () => {
	assert.deepEqual(desktopNotificationArguments("--help", "--version"), [
		"--app-name=Jihye",
		"--",
		"--help",
		"--version",
	]);
});

test("parses Tilix notification feature status", () => {
	assert.equal(parseTilixNotificationsEnabled("Notifications enabled=1"), true);
	assert.equal(parseTilixNotificationsEnabled("\tNotifications enabled=true\n"), true);
	assert.equal(parseTilixNotificationsEnabled("Notifications enabled=0"), false);
	assert.equal(parseTilixNotificationsEnabled("Notifications enabled=false"), false);
	assert.equal(parseTilixNotificationsEnabled("Tilix version: 1.9.6"), undefined);
});

test("falls back to desktop notifications when Tilix lacks OSC notification support", async () => {
	type SettledHandler = (_event: unknown, ctx: { mode: string }) => Promise<void>;
	let settledHandler: SettledHandler | undefined;
	let requestHandler: ((data: unknown) => Promise<void>) | undefined;
	let checks = 0;
	const writes: string[] = [];
	const desktopNotifications: Array<{ title: string; body: string }> = [];

	createTerminalNotifyExtension({
		env: { TILIX_ID: "session" },
		write: (value) => writes.push(value),
		tilixNotificationsEnabled: () => {
			checks += 1;
			return false;
		},
		notifyDesktop: (title, body) => desktopNotifications.push({ title, body }),
	})({
		on(_event: string, callback: SettledHandler) {
			settledHandler = callback;
		},
		events: {
			on(_event: string, callback: (data: unknown) => Promise<void>) {
				requestHandler = callback;
			},
		},
	} as never);

	assert.ok(settledHandler);
	assert.ok(requestHandler);
	await settledHandler({}, { mode: "tui" });
	await requestHandler({ mode: "tui", title: "Approval", body: "Action required", ringBell: true });
	assert.equal(checks, 1);
	assert.deepEqual(writes, ["\x07"]);
	assert.deepEqual(desktopNotifications, [
		{ title: "Pi", body: "Ready for input" },
		{ title: "Approval", body: "Action required" },
	]);
});

test("keeps OSC notifications when the Tilix build supports them", async () => {
	let handler: ((_event: unknown, ctx: { mode: string }) => Promise<void>) | undefined;
	const writes: string[] = [];
	const desktopNotifications: string[] = [];

	createTerminalNotifyExtension({
		env: { TILIX_ID: "session" },
		write: (value) => writes.push(value),
		tilixNotificationsEnabled: () => true,
		notifyDesktop: (_title, body) => desktopNotifications.push(body),
	})({
		on(_event: string, callback: typeof handler) {
			handler = callback;
		},
		events: { on() {} },
	} as never);

	assert.ok(handler);
	await handler({}, { mode: "tui" });
	assert.deepEqual(writes, [notificationSequence("osc777")]);
	assert.deepEqual(desktopNotifications, []);
});

test("caches a failed asynchronous Tilix feature check without blocking session startup", async () => {
	type SessionStartHandler = (_event: unknown, ctx: { mode: string }) => void;
	type SettledHandler = (_event: unknown, ctx: { mode: string }) => Promise<void>;
	let sessionStartHandler: SessionStartHandler | undefined;
	let settledHandler: SettledHandler | undefined;
	let checks = 0;
	const writes: string[] = [];

	createTerminalNotifyExtension({
		env: { TILIX_ID: "session" },
		write: (value) => writes.push(value),
		tilixNotificationsEnabled: async () => {
			checks += 1;
			throw new Error("probe failed");
		},
	})({
		on(event: string, callback: SessionStartHandler | SettledHandler) {
			if (event === "session_start") sessionStartHandler = callback as SessionStartHandler;
			if (event === "agent_settled") settledHandler = callback as SettledHandler;
		},
		events: { on() {} },
	} as never);

	assert.ok(sessionStartHandler);
	assert.ok(settledHandler);
	assert.equal(sessionStartHandler({}, { mode: "tui" }), undefined);
	await settledHandler({}, { mode: "tui" });
	assert.equal(checks, 1);
	assert.deepEqual(writes, [notificationSequence("osc777")]);
});

test("honors an explicit OSC 777 override in Tilix", () => {
	let handler: ((_event: unknown, ctx: { mode: string }) => void) | undefined;
	let checks = 0;
	const writes: string[] = [];

	createTerminalNotifyExtension({
		env: { TILIX_ID: "session", PI_TERMINAL_NOTIFY: "osc777" },
		write: (value) => writes.push(value),
		tilixNotificationsEnabled: () => {
			checks += 1;
			return false;
		},
	})({
		on(_event: string, callback: typeof handler) {
			handler = callback;
		},
		events: { on() {} },
	} as never);

	assert.ok(handler);
	handler({}, { mode: "tui" });
	assert.equal(checks, 0);
	assert.deepEqual(writes, [notificationSequence("osc777")]);
});

test("notifies exactly once when the agent settles in TUI mode", () => {
	setActiveSessionIdentity(undefined);
	type SettledHandler = (_event: unknown, ctx: { mode: string }) => void;
	let eventName = "";
	let handler: SettledHandler | undefined;
	const writes: string[] = [];

	createTerminalNotifyExtension({
		env: { TERM_PROGRAM: "iTerm.app" },
		write: (value) => writes.push(value),
	})({
		on(event: string, callback: SettledHandler) {
			eventName = event;
			handler = callback;
		},
		events: { on() {} },
	} as never);

	assert.equal(eventName, "agent_settled");
	assert.ok(handler);
	handler({}, { mode: "json" });
	assert.deepEqual(writes, []);
	handler({}, { mode: "tui" });
	assert.deepEqual(writes, [notificationSequence("iterm")]);
});

test("uses the active session identity as the notification title", () => {
	type SettledHandler = (_event: unknown, ctx: { mode: string }) => void;
	let handler: SettledHandler | undefined;
	const writes: string[] = [];
	setActiveSessionIdentity("Agent Three");

	try {
		createTerminalNotifyExtension({
			env: { TERM_PROGRAM: "iTerm.app" },
			write: (value) => writes.push(value),
		})({
			on(_event: string, callback: SettledHandler) {
				handler = callback;
			},
			events: { on() {} },
		} as never);

		assert.ok(handler);
		handler({}, { mode: "tui" });
		assert.deepEqual(writes, [notificationSequence("iterm", "Agent Three")]);
	} finally {
		setActiveSessionIdentity(undefined);
	}
});

test("does nothing for an unsupported terminal", () => {
	setActiveSessionIdentity(undefined);
	let handler: ((_event: unknown, ctx: { mode: string }) => void) | undefined;
	const writes: string[] = [];

	createTerminalNotifyExtension({ env: {}, write: (value) => writes.push(value) })({
		on(_event: string, callback: typeof handler) {
			handler = callback;
		},
		events: { on() {} },
	} as never);

	assert.ok(handler);
	handler({}, { mode: "tui" });
	assert.deepEqual(writes, []);
});

test("rings the terminal bell and posts an urgent notification on request", () => {
	setActiveSessionIdentity("Agent One");
	let eventName = "";
	let requestHandler: ((data: unknown) => void) | undefined;
	const writes: string[] = [];

	createTerminalNotifyExtension({
		env: { TERM_PROGRAM: "iTerm.app" },
		write: (value) => writes.push(value),
	})({
		on() {},
		events: {
			on(event: string, callback: (data: unknown) => void) {
				eventName = event;
				requestHandler = callback;
			},
		},
	} as never);

	assert.equal(eventName, TERMINAL_NOTIFY_EVENT);
	assert.ok(requestHandler);
	requestHandler({
		mode: "tui",
		body: "Bash approval required (high risk)",
		ringBell: true,
	});
	assert.deepEqual(writes, ["\x07\x1b]9;Agent One: Bash approval required (high risk)\x1b\\"]);

	requestHandler({ mode: "rpc", title: "Pi", body: "Ignored", ringBell: true });
	assert.equal(writes.length, 1);

	assert.equal(
		notificationRequestSequence(
			{ mode: "tui", title: "Pi", body: "Ignored", ringBell: true },
			{ PI_TERMINAL_NOTIFY: "off" },
		),
		"",
	);
	assert.equal(
		notificationRequestSequence(
			{ mode: "tui", title: "Custom", body: "Explicit", ringBell: false },
			{ TERM_PROGRAM: "iTerm.app" },
			"Agent One",
		),
		"\x1b]9;Custom: Explicit\x1b\\",
	);
	setActiveSessionIdentity(undefined);
});
