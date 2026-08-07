import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { SessionIdentityConfig } from "./config.ts";

const execFileAsync = promisify(execFile);
const PROCESS_LEASE_OWNER = Symbol.for("jihye.session-identity.process-owner");
const FORMAT_VERSION = 1;
const LOCK_FILE_NAME = "owner.json";
const LEASES_DIRECTORY_NAME = "leases";
const CURSOR_FILE_NAME = "cursor.json";
const LOCK_DIRECTORY_NAME = "registry.lock";

type MaybePromise<T> = T | Promise<T>;

export interface LeaseOwner {
	id: string;
	pid: number;
	fingerprint?: string;
}

export interface SessionNameLease {
	name: string;
	leaseId: string;
	ownerId: string;
}

interface LeaseRecord extends SessionNameLease {
	version: number;
	pid: number;
	processFingerprint?: string;
	acquiredAt: number;
}

interface CursorRecord {
	version: number;
	nextPoolIndex: number;
	nextFallbackNumber: number;
}

interface LockRecord {
	version: number;
	token: string;
	pid: number;
	processFingerprint?: string;
	createdAt: number;
}

export interface SessionNameAllocatorDependencies {
	now?: () => number;
	isProcessAlive?: (pid: number) => MaybePromise<boolean>;
	getProcessFingerprint?: (pid: number) => MaybePromise<string | undefined>;
	delay?: (milliseconds: number) => Promise<void>;
	beforePublishLock?: (candidatePath: string) => Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function errorCode(error: unknown): string | undefined {
	if (!isObject(error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

function isLeaseRecord(value: unknown): value is LeaseRecord {
	if (!isObject(value)) return false;
	return value.version === FORMAT_VERSION
		&& typeof value.name === "string"
		&& typeof value.leaseId === "string"
		&& typeof value.ownerId === "string"
		&& Number.isSafeInteger(value.pid)
		&& (value.pid as number) > 0
		&& (value.processFingerprint === undefined || typeof value.processFingerprint === "string")
		&& typeof value.acquiredAt === "number";
}

function isCursorRecord(value: unknown): value is CursorRecord {
	if (!isObject(value)) return false;
	return value.version === FORMAT_VERSION
		&& Number.isSafeInteger(value.nextPoolIndex)
		&& (value.nextPoolIndex as number) >= 0
		&& Number.isSafeInteger(value.nextFallbackNumber)
		&& (value.nextFallbackNumber as number) >= 1;
}

function isLockRecord(value: unknown): value is LockRecord {
	if (!isObject(value)) return false;
	return value.version === FORMAT_VERSION
		&& typeof value.token === "string"
		&& Number.isSafeInteger(value.pid)
		&& (value.pid as number) > 0
		&& (value.processFingerprint === undefined || typeof value.processFingerprint === "string")
		&& typeof value.createdAt === "number";
}

function parseJson(value: string): unknown {
	return JSON.parse(value) as unknown;
}

function safeIdentifier(value: string): string {
	return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function portableLeaseKey(name: string): string {
	return encodeURIComponent(name).toLowerCase();
}

function leaseFileName(name: string): string {
	return `${encodeURIComponent(name)}.json`;
}

export function formatFallbackName(prefix: string, number: number, minimumDigits: number): string {
	return `${prefix}-${String(number).padStart(minimumDigits, "0")}`;
}

export function getProcessLeaseOwner(): LeaseOwner {
	const globalState = globalThis as typeof globalThis & Record<symbol, unknown>;
	const existing = globalState[PROCESS_LEASE_OWNER];
	if (isObject(existing) && typeof existing.id === "string" && existing.pid === process.pid) {
		return existing as unknown as LeaseOwner;
	}

	const owner: LeaseOwner = {
		id: randomUUID(),
		pid: process.pid,
	};
	globalState[PROCESS_LEASE_OWNER] = owner;
	return owner;
}

export function isLocalProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) === "EPERM";
	}
}

export async function getLocalProcessFingerprint(pid: number): Promise<string | undefined> {
	if (!Number.isInteger(pid) || pid <= 0) return undefined;

	if (process.platform === "linux") {
		try {
			const processStat = await readFile(`/proc/${pid}/stat`, "utf8");
			const commandEnd = processStat.lastIndexOf(")");
			if (commandEnd < 0) return undefined;
			const fieldsAfterCommand = processStat.slice(commandEnd + 1).trim().split(/\s+/);
			const startTime = fieldsAfterCommand[19];
			return startTime ? `linux:${startTime}` : undefined;
		} catch {
			return undefined;
		}
	}

	if (process.platform === "win32") {
		try {
			const command = `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`;
			const { stdout } = await execFileAsync(
				"powershell.exe",
				["-NoProfile", "-NonInteractive", "-Command", command],
				{ encoding: "utf8" },
			);
			const startedAt = stdout.trim();
			return startedAt ? `win32:${startedAt}` : undefined;
		} catch {
			return undefined;
		}
	}

	try {
		const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)], {
			encoding: "utf8",
		});
		const startedAt = stdout.trim();
		return startedAt ? `${process.platform}:${startedAt}` : undefined;
	} catch {
		return undefined;
	}
}

export class SessionNameAllocator {
	private readonly now: () => number;
	private readonly isProcessAlive: (pid: number) => MaybePromise<boolean>;
	private readonly getProcessFingerprint: (pid: number) => MaybePromise<string | undefined>;
	private readonly delay: (milliseconds: number) => Promise<void>;
	private readonly beforePublishLock?: (candidatePath: string) => Promise<void>;
	private readonly leasesDirectory: string;
	private readonly cursorPath: string;
	private readonly lockPath: string;

	constructor(
		private readonly config: SessionIdentityConfig,
		private readonly owner: LeaseOwner = getProcessLeaseOwner(),
		dependencies: SessionNameAllocatorDependencies = {},
	) {
		if (new Set(config.pool.map(portableLeaseKey)).size !== config.pool.length) {
			throw new Error("Session identity names must be unique on case-insensitive filesystems");
		}
		if (!config.fallbackPrefix.trim()) {
			throw new Error("Session identity fallback prefix must not be empty");
		}

		this.now = dependencies.now ?? Date.now;
		this.isProcessAlive = dependencies.isProcessAlive ?? isLocalProcessAlive;
		this.getProcessFingerprint = dependencies.getProcessFingerprint ?? getLocalProcessFingerprint;
		this.delay = dependencies.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
		this.beforePublishLock = dependencies.beforePublishLock;
		this.leasesDirectory = join(config.stateDirectory, LEASES_DIRECTORY_NAME);
		this.cursorPath = join(config.stateDirectory, CURSOR_FILE_NAME);
		this.lockPath = join(config.stateDirectory, LOCK_DIRECTORY_NAME);
	}

	async acquire(): Promise<SessionNameLease> {
		return this.withRegistryLock(async () => {
			const owner = await this.resolveOwner();
			const leases = await this.readActiveLeases(owner);
			const ownedLeases = [...leases.values()]
				.filter((record): record is LeaseRecord => record !== undefined && record.ownerId === owner.id)
				.sort((left, right) => left.acquiredAt - right.acquiredAt);

			const existing = ownedLeases.shift();
			for (const extra of ownedLeases) {
				await unlink(this.leasePath(extra.name)).catch(() => {});
				leases.delete(extra.name);
			}
			if (existing) return this.publicLease(existing);

			const cursor = await this.readCursor();
			const occupiedNameKeys = new Set([...leases.keys()].map(portableLeaseKey));
			let name: string | undefined;

			if (this.config.pool.length > 0) {
				const start = cursor.nextPoolIndex % this.config.pool.length;
				for (let offset = 0; offset < this.config.pool.length; offset += 1) {
					const index = (start + offset) % this.config.pool.length;
					const candidate = this.config.pool[index];
					if (occupiedNameKeys.has(portableLeaseKey(candidate))) continue;
					name = candidate;
					cursor.nextPoolIndex = (index + 1) % this.config.pool.length;
					break;
				}
			}

			if (!name) {
				const firstFallbackNumber = cursor.nextFallbackNumber;
				let fallbackNumber = firstFallbackNumber;
				do {
					name = formatFallbackName(
						this.config.fallbackPrefix,
						fallbackNumber,
						this.config.fallbackMinimumDigits,
					);
					fallbackNumber = fallbackNumber === Number.MAX_SAFE_INTEGER ? 1 : fallbackNumber + 1;
					if (fallbackNumber === firstFallbackNumber && occupiedNameKeys.has(portableLeaseKey(name))) {
						throw new Error("Session identity fallback namespace is exhausted");
					}
				} while (occupiedNameKeys.has(portableLeaseKey(name)));
				cursor.nextFallbackNumber = fallbackNumber;
			}

			const record: LeaseRecord = {
				version: FORMAT_VERSION,
				name,
				leaseId: randomUUID(),
				ownerId: owner.id,
				pid: owner.pid,
				processFingerprint: owner.fingerprint,
				acquiredAt: this.now(),
			};

			await writeFile(this.leasePath(name), `${JSON.stringify(record)}\n`, {
				encoding: "utf8",
				flag: "wx",
				mode: 0o600,
			});
			try {
				await this.writeCursor(cursor);
			} catch (error) {
				await unlink(this.leasePath(name)).catch(() => {});
				throw error;
			}

			return this.publicLease(record);
		});
	}

	async release(lease: SessionNameLease): Promise<boolean> {
		return this.withRegistryLock(async () => {
			const path = this.leasePath(lease.name);
			let record: unknown;
			try {
				record = parseJson(await readFile(path, "utf8"));
			} catch (error) {
				if (errorCode(error) === "ENOENT") return false;
				throw error;
			}

			if (
				!isLeaseRecord(record)
				|| record.ownerId !== lease.ownerId
				|| record.leaseId !== lease.leaseId
			) {
				return false;
			}

			await unlink(path);
			return true;
		});
	}

	private publicLease(record: LeaseRecord): SessionNameLease {
		return {
			name: record.name,
			leaseId: record.leaseId,
			ownerId: record.ownerId,
		};
	}

	private leasePath(name: string): string {
		return join(this.leasesDirectory, leaseFileName(name));
	}

	private async resolveOwner(): Promise<LeaseOwner> {
		if (this.owner.fingerprint === undefined) {
			this.owner.fingerprint = await this.getProcessFingerprint(this.owner.pid);
		}
		return this.owner;
	}

	private async ownerIsAlive(record: { pid: number; processFingerprint?: string }): Promise<boolean> {
		if (!(await this.isProcessAlive(record.pid))) return false;
		if (!record.processFingerprint) return true;
		const actualFingerprint = await this.getProcessFingerprint(record.pid);
		return actualFingerprint === undefined || actualFingerprint === record.processFingerprint;
	}

	private async readActiveLeases(owner: LeaseOwner): Promise<Map<string, LeaseRecord | undefined>> {
		await mkdir(this.leasesDirectory, { recursive: true, mode: 0o700 });
		const leases = new Map<string, LeaseRecord | undefined>();
		const entries = await readdir(this.leasesDirectory, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
			let name: string;
			try {
				name = decodeURIComponent(entry.name.slice(0, -".json".length));
			} catch {
				continue;
			}

			const path = join(this.leasesDirectory, entry.name);
			let record: unknown;
			try {
				record = parseJson(await readFile(path, "utf8"));
			} catch {
				leases.set(name, undefined);
				continue;
			}

			if (!isLeaseRecord(record) || record.name !== name) {
				leases.set(name, undefined);
				continue;
			}

			if (record.ownerId !== owner.id && !(await this.ownerIsAlive(record))) {
				await unlink(path).catch(() => {});
				continue;
			}
			leases.set(name, record);
		}

		return leases;
	}

	private async readCursor(): Promise<CursorRecord> {
		const fallback: CursorRecord = {
			version: FORMAT_VERSION,
			nextPoolIndex: 0,
			nextFallbackNumber: 1,
		};

		try {
			const parsed = parseJson(await readFile(this.cursorPath, "utf8"));
			if (isCursorRecord(parsed)) return parsed;
		} catch (error) {
			if (errorCode(error) === "ENOENT") return fallback;
		}

		const quarantinePath = join(
			this.config.stateDirectory,
			`cursor.corrupt-${this.now()}-${randomUUID()}.json`,
		);
		await rename(this.cursorPath, quarantinePath).catch(() => {});
		return fallback;
	}

	private async writeCursor(cursor: CursorRecord): Promise<void> {
		const temporaryPath = join(this.config.stateDirectory, `cursor.${randomUUID()}.tmp`);
		try {
			await writeFile(temporaryPath, `${JSON.stringify(cursor)}\n`, {
				encoding: "utf8",
				flag: "wx",
				mode: 0o600,
			});
			await rename(temporaryPath, this.cursorPath);
		} catch (error) {
			await unlink(temporaryPath).catch(() => {});
			throw error;
		}
	}

	private async withRegistryLock<T>(operation: () => Promise<T>): Promise<T> {
		await mkdir(this.config.stateDirectory, { recursive: true, mode: 0o700 });
		await mkdir(this.leasesDirectory, { recursive: true, mode: 0o700 });
		const deadline = Date.now() + this.config.lockTimeoutMs;
		const owner = await this.resolveOwner();
		const token = randomUUID();

		while (!(await this.tryAcquireRegistryLock(token, owner))) {
			await this.tryQuarantineStaleLock();
			if (Date.now() >= deadline) {
				throw new Error("Timed out waiting for the session identity registry lock");
			}
			await this.delay(this.config.lockRetryMs);
		}

		try {
			return await operation();
		} finally {
			await this.releaseRegistryLock(token);
		}
	}

	private async tryAcquireRegistryLock(token: string, owner: LeaseOwner): Promise<boolean> {
		const candidatePath = `${this.lockPath}.candidate-${safeIdentifier(token)}`;
		const lockRecord: LockRecord = {
			version: FORMAT_VERSION,
			token,
			pid: owner.pid,
			processFingerprint: owner.fingerprint,
			createdAt: this.now(),
		};

		await mkdir(candidatePath, { mode: 0o700 });
		try {
			await writeFile(join(candidatePath, LOCK_FILE_NAME), `${JSON.stringify(lockRecord)}\n`, {
				encoding: "utf8",
				flag: "wx",
				mode: 0o600,
			});
			await this.beforePublishLock?.(candidatePath);
			try {
				await rename(candidatePath, this.lockPath);
				return true;
			} catch (error) {
				const code = errorCode(error);
				if (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM" || code === "EACCES") {
					return false;
				}
				try {
					await stat(this.lockPath);
					return false;
				} catch {
					throw error;
				}
			}
		} finally {
			await rm(candidatePath, { recursive: true, force: true });
		}
	}

	private async tryQuarantineStaleLock(): Promise<void> {
		let lockRecord: LockRecord | undefined;
		try {
			const parsed = parseJson(await readFile(join(this.lockPath, LOCK_FILE_NAME), "utf8"));
			if (isLockRecord(parsed)) lockRecord = parsed;
		} catch {
			// A process can be between mkdir and writing its owner metadata.
		}

		let staleIdentifier: string;
		if (lockRecord) {
			if (await this.ownerIsAlive(lockRecord)) return;
			staleIdentifier = lockRecord.token;
		} else {
			let lockStat;
			try {
				lockStat = await stat(this.lockPath);
			} catch {
				return;
			}
			if (this.now() - lockStat.mtimeMs < this.config.orphanLockGraceMs) return;
			staleIdentifier = `orphan-${lockStat.ino}-${Math.trunc(lockStat.mtimeMs)}`;
		}

		const quarantinePath = `${this.lockPath}.stale-${safeIdentifier(staleIdentifier)}`;
		await rename(this.lockPath, quarantinePath).catch(() => {});
	}

	private async releaseRegistryLock(token: string): Promise<void> {
		try {
			const parsed = parseJson(await readFile(join(this.lockPath, LOCK_FILE_NAME), "utf8"));
			if (!isLockRecord(parsed) || parsed.token !== token) return;
			await rm(this.lockPath, { recursive: true, force: true });
		} catch {
			// A stale-lock recovery may already have moved the directory.
		}
	}
}
