import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { SIGKILL_ESCALATION_MS, type TerminableChild, terminateChild } from "../extensions/subagent/runner.ts";

/** Child-process stand-in: records signals and only exits when told to. */
class FakeChild implements TerminableChild {
	exitCode: number | null = null;
	readonly signals: NodeJS.Signals[] = [];
	private closeListeners: Array<() => void> = [];

	kill(signal: NodeJS.Signals): boolean {
		this.signals.push(signal);
		return true;
	}

	once(_event: "close", listener: () => void): this {
		this.closeListeners.push(listener);
		return this;
	}

	/** Simulate the child exiting, as `close` does for a real process. */
	exit(code = 0): void {
		this.exitCode = code;
		for (const listener of this.closeListeners.splice(0)) listener();
	}
}

test("escalates to SIGKILL when the child ignores SIGTERM", async () => {
	const child = new FakeChild();

	terminateChild(child, 20);
	assert.deepEqual(child.signals, ["SIGTERM"]);

	await delay(60);
	assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});

test("does not escalate when the child exits promptly", async () => {
	const child = new FakeChild();

	terminateChild(child, 20);
	child.exit(0);

	await delay(60);
	assert.deepEqual(child.signals, ["SIGTERM"]);
});

test("skips escalation entirely for an already exited child", async () => {
	const child = new FakeChild();
	child.exitCode = 0;

	terminateChild(child, 20);

	await delay(60);
	assert.deepEqual(child.signals, ["SIGTERM"]);
});

test("clears the escalation timer when the child exits", (t) => {
	const clearSpy = t.mock.method(globalThis, "clearTimeout");
	const child = new FakeChild();

	const cancel = terminateChild(child, SIGKILL_ESCALATION_MS);
	assert.equal(clearSpy.mock.callCount(), 0);

	child.exit(0);
	assert.equal(clearSpy.mock.callCount(), 1, "exit must clear the pending escalation timer");

	cancel();
	assert.equal(clearSpy.mock.callCount(), 1, "a cleared timer is not cleared twice");
});
