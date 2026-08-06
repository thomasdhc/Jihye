import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const SESSION_IDENTITY_CONFIG_FILE = "session-identity.json";
export const SESSION_IDENTITY_EXAMPLE_CONFIG = fileURLToPath(
	new URL("../../examples/session-identity.json", import.meta.url),
);

const DEFAULT_FALLBACK_PREFIX = "pi-agent";
const DEFAULT_FALLBACK_MINIMUM_DIGITS = 2;
const MAX_NAME_LENGTH = 64;
const MAX_FILENAME_BYTES = 255;
const LEASE_FILE_SUFFIX = ".json";
const ALLOWED_KEYS = new Set(["names", "fallbackPrefix", "fallbackMinimumDigits"]);

export interface SessionIdentityFileConfig {
	names: string[];
	fallbackPrefix: string;
	fallbackMinimumDigits: number;
}

export interface SessionIdentityConfig {
	stateDirectory: string;
	pool: readonly string[];
	fallbackPrefix: string;
	fallbackMinimumDigits: number;
	lockTimeoutMs: number;
	lockRetryMs: number;
	orphanLockGraceMs: number;
}

class InvalidSessionIdentityConfigError extends Error {
	constructor(message: string, readonly sourceError?: unknown) {
		super(message);
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	if (!isObject(error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

function invalidConfig(path: string, message: string, sourceError?: unknown): Error {
	return new InvalidSessionIdentityConfigError(
		`Invalid session identity config at ${path}: ${message}`,
		sourceError,
	);
}

function validateLabel(value: unknown, label: string, path: string): string {
	if (typeof value !== "string") throw invalidConfig(path, `${label} must be a string`);
	const trimmed = value.trim();
	if (!trimmed) throw invalidConfig(path, `${label} must not be empty`);
	if (trimmed.length > MAX_NAME_LENGTH) {
		throw invalidConfig(path, `${label} must be at most ${MAX_NAME_LENGTH} characters`);
	}
	if (/[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)) {
		throw invalidConfig(path, `${label} must not contain control characters`);
	}
	if (/[\ud800-\udfff]/u.test(trimmed)) {
		throw invalidConfig(path, `${label} must not contain unpaired Unicode surrogates`);
	}
	if (Buffer.byteLength(`${encodeURIComponent(trimmed)}${LEASE_FILE_SUFFIX}`) > MAX_FILENAME_BYTES) {
		throw invalidConfig(path, `${label} is too long for a portable lease filename`);
	}
	return trimmed;
}

export function loadSessionIdentityFile(path: string): SessionIdentityFileConfig {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw invalidConfig(path, message, error);
	}

	if (!isObject(parsed)) throw invalidConfig(path, "expected a JSON object");
	const unknownKeys = Object.keys(parsed).filter((key) => !ALLOWED_KEYS.has(key));
	if (unknownKeys.length > 0) {
		throw invalidConfig(path, `unknown ${unknownKeys.length === 1 ? "key" : "keys"}: ${unknownKeys.join(", ")}`);
	}
	if (!Array.isArray(parsed.names)) throw invalidConfig(path, "names must be an array");

	const names = parsed.names.map((name, index) => validateLabel(name, `names[${index}]`, path));
	const portableNameKeys = names.map((name) => encodeURIComponent(name).toLowerCase());
	if (new Set(portableNameKeys).size !== names.length) {
		throw invalidConfig(path, "names must be unique on case-insensitive filesystems");
	}

	const fallbackPrefix = validateLabel(
		parsed.fallbackPrefix ?? DEFAULT_FALLBACK_PREFIX,
		"fallbackPrefix",
		path,
	);
	const fallbackMinimumDigits = parsed.fallbackMinimumDigits ?? DEFAULT_FALLBACK_MINIMUM_DIGITS;
	if (
		!Number.isSafeInteger(fallbackMinimumDigits)
		|| (fallbackMinimumDigits as number) < 1
		|| (fallbackMinimumDigits as number) > 12
	) {
		throw invalidConfig(path, "fallbackMinimumDigits must be an integer from 1 to 12");
	}
	const largestFallbackName = `${fallbackPrefix}-${String(Number.MAX_SAFE_INTEGER).padStart(
		fallbackMinimumDigits as number,
		"0",
	)}`;
	if (Buffer.byteLength(`${encodeURIComponent(largestFallbackName)}${LEASE_FILE_SUFFIX}`) > MAX_FILENAME_BYTES) {
		throw invalidConfig(path, "fallbackPrefix is too long for portable fallback lease filenames");
	}

	return {
		names,
		fallbackPrefix,
		fallbackMinimumDigits: fallbackMinimumDigits as number,
	};
}

export function createSessionIdentityConfig(
	agentDirectory = getAgentDir(),
	exampleConfigPath = SESSION_IDENTITY_EXAMPLE_CONFIG,
): SessionIdentityConfig {
	const userConfigPath = join(agentDirectory, SESSION_IDENTITY_CONFIG_FILE);
	let fileConfig: SessionIdentityFileConfig;
	try {
		fileConfig = loadSessionIdentityFile(userConfigPath);
	} catch (error) {
		if (
			!(error instanceof InvalidSessionIdentityConfigError)
			|| errorCode(error.sourceError) !== "ENOENT"
		) {
			throw error;
		}
		fileConfig = loadSessionIdentityFile(exampleConfigPath);
	}

	return {
		stateDirectory: join(agentDirectory, "state", "session-identity"),
		pool: fileConfig.names,
		fallbackPrefix: fileConfig.fallbackPrefix,
		fallbackMinimumDigits: fileConfig.fallbackMinimumDigits,
		lockTimeoutMs: 5_000,
		lockRetryMs: 20,
		orphanLockGraceMs: 2_000,
	};
}
