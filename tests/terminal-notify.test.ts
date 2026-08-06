import assert from "node:assert/strict";
import test from "node:test";

import {
	createTerminalNotifyExtension,
	detectNotificationProtocol,
	notificationRequestSequence,
	notificationSequence,
	TERMINAL_NOTIFY_EVENT,
} from "../extensions/terminal-notify.ts";
import { setActiveSessionIdentity } from "../lib/session-identity.ts";

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
