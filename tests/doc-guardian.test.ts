import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	classifyLineCount,
	countLines,
	createDocGuardianExtension,
	DOC_GUARDIAN_POLICY,
	normalizeContextFiles,
	shouldRemind,
} from "../extensions/doc-guardian.ts";

function contentWithLines(count: number): string {
	return `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n")}\n`;
}

test("counts content lines without treating the final newline as an extra line", () => {
	assert.equal(countLines(""), 0);
	assert.equal(countLines("one"), 1);
	assert.equal(countLines("one\ntwo"), 2);
	assert.equal(countLines("one\ntwo\n"), 2);
	assert.equal(countLines("one\r\ntwo\r\n"), 2);
});

test("uses forgiving size thresholds", () => {
	assert.equal(classifyLineCount(124), "healthy");
	assert.equal(classifyLineCount(DOC_GUARDIAN_POLICY.cautionLines), "healthy");
	assert.equal(classifyLineCount(DOC_GUARDIAN_POLICY.cautionLines + 1), "caution");
	assert.equal(classifyLineCount(DOC_GUARDIAN_POLICY.warningLines), "caution");
	assert.equal(classifyLineCount(DOC_GUARDIAN_POLICY.warningLines + 1), "warning");
});

test("sends periodic review reminders only at the configured interval", () => {
	assert.equal(shouldRemind(DOC_GUARDIAN_POLICY.reviewEvery - 1), false);
	assert.equal(shouldRemind(DOC_GUARDIAN_POLICY.reviewEvery), true);
	assert.equal(shouldRemind(DOC_GUARDIAN_POLICY.reviewEvery + 1), false);
	assert.equal(shouldRemind(DOC_GUARDIAN_POLICY.reviewEvery * 2), true);
});

test("keeps Pi's authoritative context list and removes only exact duplicates", () => {
	const uppercaseAgents = { path: "/repo/AGENTS.MD", content: "uppercase" };
	const claude = { path: "/repo/CLAUDE.md", content: "fallback" };
	assert.deepEqual(
		normalizeContextFiles([uppercaseAgents, uppercaseAgents, claude]),
		[uppercaseAgents, claude],
	);
});

test("does not warn for 124 lines and warns only once per oversized episode", async (t) => {
	const home = mkdtempSync(join(tmpdir(), "doc-guardian-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));

	const agentsPath = join(home, "Workspace", "AGENTS.md");
	type EventHandler = (_event: any, ctx: any) => Promise<void> | void;
	const handlers = new Map<string, EventHandler>();
	const notifications: Array<{ message: string; level: string }> = [];

	createDocGuardianExtension({ home })({
		on(event: string, handler: EventHandler) {
			handlers.set(event, handler);
		},
		appendEntry() {},
		registerCommand() {},
	} as never);

	const ctx = {
		sessionManager: { getEntries: () => [] },
		ui: {
			setStatus() {},
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
		},
	};
	const loadContext = async (lineCount: number) => {
		await handlers.get("before_agent_start")?.({
			systemPromptOptions: {
				contextFiles: [{ path: agentsPath, content: contentWithLines(lineCount) }],
			},
		}, ctx);
	};

	await handlers.get("session_start")?.({}, ctx);
	await loadContext(124);
	await handlers.get("agent_settled")?.({}, ctx);
	assert.deepEqual(notifications, []);

	await loadContext(DOC_GUARDIAN_POLICY.warningLines + 1);
	await handlers.get("agent_settled")?.({}, ctx);
	await handlers.get("agent_settled")?.({}, ctx);
	assert.equal(notifications.filter((item) => item.level === "warning").length, 1);

	await loadContext(124);
	await handlers.get("agent_settled")?.({}, ctx);
	await loadContext(DOC_GUARDIAN_POLICY.warningLines + 1);
	await handlers.get("agent_settled")?.({}, ctx);
	assert.equal(notifications.filter((item) => item.level === "warning").length, 2);
});

test("review-docs uses Pi's loaded files and treats length as a signal rather than a defect", async (t) => {
	const home = mkdtempSync(join(tmpdir(), "doc-guardian-"));
	t.after(() => rmSync(home, { recursive: true, force: true }));

	const loadedPath = join(home, "Workspace", "AGENTS.MD");
	const unloadedPath = join(home, "Workspace", "CLAUDE.md");
	type Command = { handler: (_args: string, ctx: any) => Promise<void> };
	const commands = new Map<string, Command>();
	let prompt = "";

	createDocGuardianExtension({ home })({
		on() {},
		appendEntry() {},
		registerCommand(name: string, command: Command) {
			commands.set(name, command);
		},
		sendUserMessage(message: string) {
			prompt = message;
		},
	} as never);

	await commands.get("review-docs")?.handler("", {
		waitForIdle: async () => {},
		getSystemPromptOptions: () => ({
			contextFiles: [{ path: loadedPath, content: contentWithLines(124) }],
		}),
		ui: { notify() {} },
	});

	assert.match(prompt, /~\/Workspace\/AGENTS\.MD/);
	assert.doesNotMatch(prompt, new RegExp(unloadedPath));
	assert.match(prompt, /length alone is not a defect/);
	assert.match(prompt, /preserve useful operational detail and guardrails/);
	assert.match(prompt, /do not enforce a universal line limit/);
});
