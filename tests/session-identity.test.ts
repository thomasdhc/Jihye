import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	formatFallbackName,
	SessionNameAllocator,
	type LeaseOwner,
	type SessionNameAllocatorDependencies,
	type SessionNameLease,
} from "../extensions/session-identity/allocator.ts";
import {
	createSessionIdentityConfig,
	SESSION_IDENTITY_CONFIG_FILE,
	type SessionIdentityConfig,
} from "../extensions/session-identity/config.ts";
import {
	createSessionIdentityExtension,
	formatSessionIdentityTitle,
} from "../extensions/session-identity/index.ts";
import {
	COMPANION_WIDGET_UPDATE_EVENT,
	type CompanionWidgetUpdate,
} from "../lib/companion-widget.ts";
import {
	getActiveSessionIdentity,
	setActiveSessionIdentity,
} from "../lib/session-identity.ts";

const EXAMPLE_NAMES = [
	"Agent One",
	"Agent Two",
	"Agent Three",
	"Agent Four",
	"Agent Five",
	"Agent Six",
	"Agent Seven",
	"Agent Eight",
] as const;

function temporaryDirectory(): string {
	return mkdtempSync(join(tmpdir(), "pi-session-identity-"));
}

function testConfig(
	stateDirectory: string,
	pool: readonly string[] = EXAMPLE_NAMES,
): SessionIdentityConfig {
	return {
		stateDirectory,
		pool,
		fallbackPrefix: "pi-agent",
		fallbackMinimumDigits: 2,
		lockTimeoutMs: 2_000,
		lockRetryMs: 1,
		orphanLockGraceMs: 10,
	};
}

function owner(index: number, fingerprint = `process-${index}`): LeaseOwner {
	return {
		id: `owner-${index}`,
		pid: 10_000 + index,
		fingerprint,
	};
}

function dependencies(
	fingerprints = new Map<number, string>(),
	alive: (pid: number) => boolean = () => true,
): SessionNameAllocatorDependencies {
	return {
		isProcessAlive: alive,
		getProcessFingerprint: (pid) => fingerprints.get(pid) ?? `process-${pid - 10_000}`,
		delay: async () => {},
	};
}

function allocator(
	stateDirectory: string,
	leaseOwner: LeaseOwner,
	pool: readonly string[] = EXAMPLE_NAMES,
	customDependencies?: SessionNameAllocatorDependencies,
): SessionNameAllocator {
	return new SessionNameAllocator(
		testConfig(stateDirectory, pool),
		leaseOwner,
		customDependencies ?? dependencies(),
	);
}

test("loads the bundled example names and fallback format", () => {
	const directory = temporaryDirectory();
	try {
		const config = createSessionIdentityConfig(directory);
		assert.deepEqual(config.pool, EXAMPLE_NAMES);
		assert.equal(config.stateDirectory, join(directory, "state", "session-identity"));
		assert.equal(formatFallbackName(config.fallbackPrefix, 1, config.fallbackMinimumDigits), "pi-agent-01");
		assert.equal(formatFallbackName(config.fallbackPrefix, 105, config.fallbackMinimumDigits), "pi-agent-105");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("loads a user-owned session identity config instead of the bundled example", () => {
	const directory = temporaryDirectory();
	try {
		writeFileSync(join(directory, SESSION_IDENTITY_CONFIG_FILE), `${JSON.stringify({
			names: ["Red", "Blue"],
			fallbackPrefix: "helper",
			fallbackMinimumDigits: 3,
		})}\n`);

		const config = createSessionIdentityConfig(directory);
		assert.deepEqual(config.pool, ["Red", "Blue"]);
		assert.equal(config.fallbackPrefix, "helper");
		assert.equal(config.fallbackMinimumDigits, 3);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("rejects an invalid user config instead of silently using the example", () => {
	const directory = temporaryDirectory();
	try {
		const configPath = join(directory, SESSION_IDENTITY_CONFIG_FILE);
		writeFileSync(configPath, `${JSON.stringify({ names: ["Agent", "agent"] })}\n`);
		assert.throws(
			() => createSessionIdentityConfig(directory),
			(error: unknown) => error instanceof Error
				&& error.message.includes(configPath)
				&& error.message.includes("case-insensitive filesystems"),
		);

		writeFileSync(configPath, `${JSON.stringify({ names: ["Agent One\nAgent Two"] })}\n`);
		assert.throws(
			() => createSessionIdentityConfig(directory),
			/control characters/,
		);

		writeFileSync(configPath, `${JSON.stringify({ names: ["界".repeat(64)] })}\n`);
		assert.throws(
			() => createSessionIdentityConfig(directory),
			/portable lease filename/,
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("allocates released names in persistent round-robin order", async () => {
	const directory = temporaryDirectory();
	try {
		const assigned: string[] = [];
		for (let index = 0; index < EXAMPLE_NAMES.length + 1; index += 1) {
			const currentAllocator = allocator(directory, owner(index + 1));
			const lease = await currentAllocator.acquire();
			assigned.push(lease.name);
			assert.equal(await currentAllocator.release(lease), true);
		}

		assert.deepEqual(assigned, [...EXAMPLE_NAMES, EXAMPLE_NAMES[0]]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("reuses the same process lease across extension reloads", async () => {
	const directory = temporaryDirectory();
	try {
		const firstOwner = owner(1);
		const firstLease = await allocator(directory, firstOwner).acquire();
		const reloadedLease = await allocator(directory, { ...firstOwner }).acquire();
		assert.deepEqual(reloadedLease, firstLease);

		const nextLease = await allocator(directory, owner(2)).acquire();
		assert.equal(nextLease.name, "Agent Two");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("treats case-only lease names as occupied across config changes", async () => {
	const directory = temporaryDirectory();
	try {
		const firstLease = await allocator(directory, owner(1), ["Agent"]).acquire();
		assert.equal(firstLease.name, "Agent");

		const secondLease = await allocator(directory, owner(2), ["agent"]).acquire();
		assert.equal(secondLease.name, "pi-agent-01");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("keeps concurrent allocations unique and falls back after pool exhaustion", async () => {
	const directory = temporaryDirectory();
	try {
		const allocators = Array.from(
			{ length: EXAMPLE_NAMES.length + 2 },
			(_, index) => allocator(directory, owner(index + 1)),
		);
		const leases = await Promise.all(allocators.map((item) => item.acquire()));
		const names = leases.map((lease) => lease.name);

		assert.equal(new Set(names).size, names.length);
		assert.deepEqual(
			new Set(names),
			new Set([...EXAMPLE_NAMES, "pi-agent-01", "pi-agent-02"]),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("publishes fully formed locks atomically under contention", async () => {
	const directory = temporaryDirectory();
	let signalCandidateReady: (() => void) | undefined;
	let resumePublish: (() => void) | undefined;
	const candidateReady = new Promise<void>((resolve) => {
		signalCandidateReady = resolve;
	});
	const publishAllowed = new Promise<void>((resolve) => {
		resumePublish = resolve;
	});

	try {
		const firstDependencies = dependencies();
		firstDependencies.beforePublishLock = async (candidatePath) => {
			assert.equal(existsSync(join(directory, "registry.lock")), false);
			assert.equal(existsSync(join(candidatePath, "owner.json")), true);
			signalCandidateReady?.();
			await publishAllowed;
		};
		const first = allocator(directory, owner(1), ["Agent One"], firstDependencies);
		const firstLeasePromise = first.acquire();
		await candidateReady;

		const second = allocator(directory, owner(2), ["Agent One"]);
		const secondLease = await second.acquire();
		resumePublish?.();
		const firstLease = await firstLeasePromise;

		assert.equal(new Set([firstLease.name, secondLease.name]).size, 2);
		assert.deepEqual(new Set([firstLease.name, secondLease.name]), new Set(["Agent One", "pi-agent-01"]));
	} finally {
		resumePublish?.();
		rmSync(directory, { recursive: true, force: true });
	}
});

test("reclaims a crashed process lease", async () => {
	const directory = temporaryDirectory();
	try {
		const firstOwner = owner(1);
		const first = allocator(directory, firstOwner, ["Agent One"]);
		assert.equal((await first.acquire()).name, "Agent One");

		const secondOwner = owner(2);
		const second = allocator(
			directory,
			secondOwner,
			["Agent One"],
			dependencies(new Map(), (pid) => pid !== firstOwner.pid),
		);
		assert.equal((await second.acquire()).name, "Agent One");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("uses process fingerprints to detect PID reuse", async () => {
	const directory = temporaryDirectory();
	try {
		const reusedPid = 42_000;
		const fingerprints = new Map([[reusedPid, "old-process"]]);
		const sharedDependencies = dependencies(fingerprints, () => true);
		const first = allocator(
			directory,
			{ id: "old-owner", pid: reusedPid },
			["Agent One"],
			sharedDependencies,
		);
		assert.equal((await first.acquire()).name, "Agent One");

		fingerprints.set(reusedPid, "new-process");
		const second = allocator(
			directory,
			{ id: "new-owner", pid: reusedPid },
			["Agent One"],
			sharedDependencies,
		);
		assert.equal((await second.acquire()).name, "Agent One");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("does not let an old lease release a reassigned name", async () => {
	const directory = temporaryDirectory();
	try {
		const first = allocator(directory, owner(1), ["Agent One"]);
		const oldLease = await first.acquire();
		assert.equal(await first.release(oldLease), true);

		const second = allocator(directory, owner(2), ["Agent One"]);
		const currentLease = await second.acquire();
		assert.equal(currentLease.name, "Agent One");
		assert.equal(await first.release(oldLease), false);

		const third = allocator(directory, owner(3), ["Agent One"]);
		assert.equal((await third.acquire()).name, "pi-agent-01");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("treats malformed lease files as occupied instead of duplicating a name", async () => {
	const directory = temporaryDirectory();
	try {
		const leasesDirectory = join(directory, "leases");
		mkdirSync(leasesDirectory, { recursive: true });
		writeFileSync(join(leasesDirectory, "Agent One.json"), "not json\n");

		const lease = await allocator(directory, owner(1), ["Agent One"]).acquire();
		assert.equal(lease.name, "pi-agent-01");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("quarantines a corrupt cursor without risking active leases", async () => {
	const directory = temporaryDirectory();
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, "cursor.json"), "not json\n");

		const lease = await allocator(directory, owner(1), ["Agent One"]).acquire();
		assert.equal(lease.name, "Agent One");
		assert.ok(readdirSync(directory).some((entry) => entry.startsWith("cursor.corrupt-")));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("rejects unsafe cursor integers instead of looping on fallback allocation", async () => {
	const directory = temporaryDirectory();
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, "cursor.json"), `${JSON.stringify({
			version: 1,
			nextPoolIndex: 1e21,
			nextFallbackNumber: 1e21,
		})}\n`);

		const lease = await allocator(directory, owner(1), []).acquire();
		assert.equal(lease.name, "pi-agent-01");
		assert.ok(readdirSync(directory).some((entry) => entry.startsWith("cursor.corrupt-")));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("retries when publishing a lock loses to an active owner", async () => {
	const directory = temporaryDirectory();
	try {
		const lockDirectory = join(directory, "registry.lock");
		mkdirSync(lockDirectory, { recursive: true });
		writeFileSync(join(lockDirectory, "owner.json"), `${JSON.stringify({
			version: 1,
			token: "active-lock",
			pid: 98_000,
			processFingerprint: "active-process",
			createdAt: Date.now(),
		})}\n`);

		let retries = 0;
		const retryDependencies = dependencies(
			new Map([[98_000, "active-process"]]),
			() => true,
		);
		retryDependencies.delay = async () => {
			retries += 1;
			rmSync(lockDirectory, { recursive: true, force: true });
		};

		const lease = await allocator(
			directory,
			owner(1),
			["Agent One"],
			retryDependencies,
		).acquire();
		assert.equal(lease.name, "Agent One");
		assert.ok(retries >= 1);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("recovers a registry lock left by a crashed process", async () => {
	const directory = temporaryDirectory();
	try {
		const lockDirectory = join(directory, "registry.lock");
		mkdirSync(lockDirectory, { recursive: true });
		writeFileSync(join(lockDirectory, "owner.json"), `${JSON.stringify({
			version: 1,
			token: "dead-lock",
			pid: 99_999,
			processFingerprint: "dead-process",
			createdAt: 1,
		})}\n`);

		const lease = await allocator(
			directory,
			owner(1),
			["Agent One"],
			dependencies(new Map(), (pid) => pid !== 99_999),
		).acquire();
		assert.equal(lease.name, "Agent One");
		assert.ok(readdirSync(directory).includes("registry.lock.stale-dead-lock"));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("reports an invalid user config without disabling extension registration", async () => {
	type Handler = (event: Record<string, unknown>, ctx: any) => Promise<void> | void;
	const handlers = new Map<string, Handler>();
	const notifications: string[] = [];
	const headlessWarnings: string[] = [];
	const companionUpdates: CompanionWidgetUpdate[] = [];
	let currentName: string | undefined = "Agent One";
	const extension = createSessionIdentityExtension({
		createConfig() {
			throw new Error("Invalid session identity config at /tmp/session-identity.json: names must be unique");
		},
		reportWarning(message) {
			headlessWarnings.push(message);
		},
	});

	extension({
		events: {
			emit(event: string, update: CompanionWidgetUpdate) {
				assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
				companionUpdates.push(update);
			},
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		getSessionName() {
			return currentName;
		},
		setSessionName(name: string) {
			currentName = name;
		},
	} as never);

	setActiveSessionIdentity("Agent One");
	try {
		await handlers.get("session_start")?.({}, {
			hasUI: true,
			cwd: "/workspace/project",
			ui: {
				notify(message: string) {
					notifications.push(message);
				},
			},
		});
		assert.equal(currentName, "");
		assert.equal(getActiveSessionIdentity(), undefined);

		await handlers.get("session_start")?.({}, {
			hasUI: false,
			cwd: "/workspace/project",
			ui: {},
		});

		const warning = "Session identity unavailable: Invalid session identity config at /tmp/session-identity.json: names must be unique";
		assert.deepEqual(notifications, [warning]);
		assert.deepEqual(headlessWarnings, [warning]);
		assert.deepEqual(companionUpdates, [
			{ id: "session-identity" },
			{ id: "session-identity" },
		]);
	} finally {
		setActiveSessionIdentity(undefined);
	}
});

test("publishes the session identity without taking over the session display name", async () => {
	type Handler = (event: Record<string, unknown>, ctx: TestContext) => Promise<void> | void;
	interface TestContext {
		hasUI: boolean;
		cwd: string;
		ui: {
			setTitle(title: string): void;
			notify(message: string, level: string): void;
		};
	}

	const lease: SessionNameLease = {
		name: "Agent One",
		leaseId: "lease-1",
		ownerId: "owner-1",
	};
	let currentName: string | undefined = "Agent One";
	let releaseCount = 0;
	const titles: string[] = [];
	const notifications: string[] = [];
	const assignedSessionNames: string[] = [];
	const companionUpdates: CompanionWidgetUpdate[] = [];
	const sharedAllocator = {
		async acquire() {
			return lease;
		},
		async release(released: SessionNameLease) {
			assert.deepEqual(released, lease);
			releaseCount += 1;
			return true;
		},
	};

	function registerRuntime(): Map<string, Handler> {
		const handlers = new Map<string, Handler>();
		const extension = createSessionIdentityExtension({ allocator: sharedAllocator });
		extension({
			events: {
				emit(event: string, update: CompanionWidgetUpdate) {
					assert.equal(event, COMPANION_WIDGET_UPDATE_EVENT);
					companionUpdates.push(update);
				},
			},
			on(event: string, handler: Handler) {
				handlers.set(event, handler);
			},
			getSessionName() {
				return currentName;
			},
			setSessionName(name: string) {
				currentName = name;
				assignedSessionNames.push(name);
			},
		} as never);
		return handlers;
	}

	const ctx: TestContext = {
		hasUI: true,
		cwd: "/workspace/project",
		ui: {
			setTitle(title) {
				titles.push(title);
			},
			notify(message) {
				notifications.push(message);
			},
		},
	};

	setActiveSessionIdentity(undefined);
	setActiveSessionIdentity("Agent One");
	try {
		const handlers = registerRuntime();
		await handlers.get("session_start")?.({ reason: "reload" }, ctx);
		assert.equal(currentName, "");
		assert.deepEqual(assignedSessionNames, [""]);
		assert.equal(getActiveSessionIdentity(), "Agent One");
		assert.equal(titles.at(-1), "π - Agent One - project");
		assert.deepEqual(notifications, []);
		assert.deepEqual(companionUpdates.at(-1), {
			id: "session-identity",
			contribution: {
				id: "session-identity",
				region: "details",
				order: 30,
				lines: ["Agent One"],
				tone: "accent",
			},
		});

		currentName = "Agent One";
		await handlers.get("session_info_changed")?.({ name: "Agent One" }, ctx);
		assert.equal(currentName, "Agent One");
		assert.deepEqual(assignedSessionNames, [""]);
		assert.equal(titles.at(-1), "π - Agent One - project");

		await handlers.get("session_shutdown")?.({ reason: "reload" }, ctx);
		assert.equal(releaseCount, 0);
		assert.equal(getActiveSessionIdentity(), "Agent One");
		assert.deepEqual(companionUpdates.at(-1), { id: "session-identity" });

		const reloadedHandlers = registerRuntime();
		await reloadedHandlers.get("session_start")?.({ reason: "reload" }, ctx);
		assert.equal(currentName, "Agent One");
		assert.deepEqual(assignedSessionNames, [""]);
		assert.deepEqual(companionUpdates.at(-1), {
			id: "session-identity",
			contribution: {
				id: "session-identity",
				region: "details",
				order: 30,
				lines: ["Agent One"],
				tone: "accent",
			},
		});

		currentName = "manual-name";
		await reloadedHandlers.get("session_info_changed")?.({ name: "manual-name" }, ctx);
		assert.equal(currentName, "manual-name");
		assert.deepEqual(assignedSessionNames, [""]);
		assert.equal(titles.at(-1), "π - Agent One - project");

		await reloadedHandlers.get("session_shutdown")?.({ reason: "quit" }, ctx);
		assert.equal(releaseCount, 1);
		assert.equal(getActiveSessionIdentity(), undefined);
		assert.deepEqual(companionUpdates.at(-1), { id: "session-identity" });
	} finally {
		setActiveSessionIdentity(undefined);
	}
});

test("formats terminal titles consistently", () => {
	assert.equal(formatSessionIdentityTitle("Agent Three", "/workspace/pi-extensio"), "π - Agent Three - pi-extensio");
});
