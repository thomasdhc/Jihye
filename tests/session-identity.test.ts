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
	SESSION_NAME_POOL,
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

function temporaryDirectory(): string {
	return mkdtempSync(join(tmpdir(), "pi-session-identity-"));
}

function testConfig(
	stateDirectory: string,
	pool: readonly string[] = SESSION_NAME_POOL,
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
	pool: readonly string[] = SESSION_NAME_POOL,
	customDependencies?: SessionNameAllocatorDependencies,
): SessionNameAllocator {
	return new SessionNameAllocator(
		testConfig(stateDirectory, pool),
		leaseOwner,
		customDependencies ?? dependencies(),
	);
}

test("defines the selected session-name pool and fallback format", () => {
	assert.deepEqual(SESSION_NAME_POOL, [
		"Aqila",
		"Athena",
		"Ji-hye",
		"Cyrus",
		"Lozen",
		"Odin",
		"Augustine",
		"Manuela",
	]);
	assert.equal(formatFallbackName("pi-agent", 1, 2), "pi-agent-01");
	assert.equal(formatFallbackName("pi-agent", 105, 2), "pi-agent-105");

	const config = createSessionIdentityConfig("/tmp/pi-agent");
	assert.equal(config.stateDirectory, "/tmp/pi-agent/state/session-identity");
});

test("allocates released names in persistent round-robin order", async () => {
	const directory = temporaryDirectory();
	try {
		const assigned: string[] = [];
		for (let index = 0; index < SESSION_NAME_POOL.length + 1; index += 1) {
			const currentAllocator = allocator(directory, owner(index + 1));
			const lease = await currentAllocator.acquire();
			assigned.push(lease.name);
			assert.equal(await currentAllocator.release(lease), true);
		}

		assert.deepEqual(assigned, [...SESSION_NAME_POOL, SESSION_NAME_POOL[0]]);
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
		assert.equal(nextLease.name, "Athena");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("keeps concurrent allocations unique and falls back after pool exhaustion", async () => {
	const directory = temporaryDirectory();
	try {
		const allocators = Array.from(
			{ length: SESSION_NAME_POOL.length + 2 },
			(_, index) => allocator(directory, owner(index + 1)),
		);
		const leases = await Promise.all(allocators.map((item) => item.acquire()));
		const names = leases.map((lease) => lease.name);

		assert.equal(new Set(names).size, names.length);
		assert.deepEqual(
			new Set(names),
			new Set([...SESSION_NAME_POOL, "pi-agent-01", "pi-agent-02"]),
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
		const first = allocator(directory, owner(1), ["Aqila"], firstDependencies);
		const firstLeasePromise = first.acquire();
		await candidateReady;

		const second = allocator(directory, owner(2), ["Aqila"]);
		const secondLease = await second.acquire();
		resumePublish?.();
		const firstLease = await firstLeasePromise;

		assert.equal(new Set([firstLease.name, secondLease.name]).size, 2);
		assert.deepEqual(new Set([firstLease.name, secondLease.name]), new Set(["Aqila", "pi-agent-01"]));
	} finally {
		resumePublish?.();
		rmSync(directory, { recursive: true, force: true });
	}
});

test("reclaims a crashed process lease", async () => {
	const directory = temporaryDirectory();
	try {
		const firstOwner = owner(1);
		const first = allocator(directory, firstOwner, ["Aqila"]);
		assert.equal((await first.acquire()).name, "Aqila");

		const secondOwner = owner(2);
		const second = allocator(
			directory,
			secondOwner,
			["Aqila"],
			dependencies(new Map(), (pid) => pid !== firstOwner.pid),
		);
		assert.equal((await second.acquire()).name, "Aqila");
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
			["Aqila"],
			sharedDependencies,
		);
		assert.equal((await first.acquire()).name, "Aqila");

		fingerprints.set(reusedPid, "new-process");
		const second = allocator(
			directory,
			{ id: "new-owner", pid: reusedPid },
			["Aqila"],
			sharedDependencies,
		);
		assert.equal((await second.acquire()).name, "Aqila");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("does not let an old lease release a reassigned name", async () => {
	const directory = temporaryDirectory();
	try {
		const first = allocator(directory, owner(1), ["Aqila"]);
		const oldLease = await first.acquire();
		assert.equal(await first.release(oldLease), true);

		const second = allocator(directory, owner(2), ["Aqila"]);
		const currentLease = await second.acquire();
		assert.equal(currentLease.name, "Aqila");
		assert.equal(await first.release(oldLease), false);

		const third = allocator(directory, owner(3), ["Aqila"]);
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
		writeFileSync(join(leasesDirectory, "Aqila.json"), "not json\n");

		const lease = await allocator(directory, owner(1), ["Aqila"]).acquire();
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

		const lease = await allocator(directory, owner(1), ["Aqila"]).acquire();
		assert.equal(lease.name, "Aqila");
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
			["Aqila"],
			retryDependencies,
		).acquire();
		assert.equal(lease.name, "Aqila");
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
			["Aqila"],
			dependencies(new Map(), (pid) => pid !== 99_999),
		).acquire();
		assert.equal(lease.name, "Aqila");
		assert.ok(readdirSync(directory).includes("registry.lock.stale-dead-lock"));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("synchronizes the session name, terminal title, and process identity", async () => {
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
		name: "Aqila",
		leaseId: "lease-1",
		ownerId: "owner-1",
	};
	let currentName: string | undefined;
	let releaseCount = 0;
	const handlers = new Map<string, Handler>();
	const titles: string[] = [];
	const notifications: string[] = [];
	const companionUpdates: CompanionWidgetUpdate[] = [];
	const extension = createSessionIdentityExtension({
		allocator: {
			async acquire() {
				return lease;
			},
			async release(released) {
				assert.deepEqual(released, lease);
				releaseCount += 1;
				return true;
			},
		},
	});

	extension({
		events: {
			emit(event: string, update: CompanionWidgetUpdate) {
				if (event === COMPANION_WIDGET_UPDATE_EVENT) companionUpdates.push(update);
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
	try {
		await handlers.get("session_start")?.({ reason: "startup" }, ctx);
		assert.equal(currentName, "Aqila");
		assert.equal(getActiveSessionIdentity(), "Aqila");
		assert.equal(titles.at(-1), "π - Aqila - project");
		assert.deepEqual(notifications, []);
		assert.deepEqual(companionUpdates.at(-1), {
			id: "session-identity",
			contribution: {
				id: "session-identity",
				region: "details",
				order: 30,
				lines: ["Aqila"],
				tone: "accent",
			},
		});

		currentName = "manual-name";
		await handlers.get("session_info_changed")?.({ name: "manual-name" }, ctx);
		assert.equal(currentName, "Aqila");

		for (const reason of ["reload", "new", "resume", "fork"]) {
			await handlers.get("session_shutdown")?.({ reason }, ctx);
		}
		assert.equal(releaseCount, 0);
		assert.equal(getActiveSessionIdentity(), "Aqila");

		await handlers.get("session_shutdown")?.({ reason: "quit" }, ctx);
		assert.equal(releaseCount, 1);
		assert.equal(getActiveSessionIdentity(), undefined);
		assert.deepEqual(companionUpdates.at(-1), { id: "session-identity" });
	} finally {
		setActiveSessionIdentity(undefined);
	}
});

test("formats terminal titles consistently", () => {
	assert.equal(formatSessionIdentityTitle("Ji-hye", "/workspace/pi-extensio"), "π - Ji-hye - pi-extensio");
});
