import { readFileSync } from "node:fs";
import * as path from "node:path";

import type { WorkspaceProfile } from "./paths.ts";

export const JIHYE_RUNTIME_ENTRY_TYPE = "jihye-runtime";
export const JIHYE_RUNTIME_SCHEMA_VERSION = 1 as const;

export interface JihyeRuntimeMetadata {
	schemaVersion: number;
	jihyeVersion: string;
	profile: string;
	piVersion: string;
}

interface RuntimeEntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function loadJihyePackageVersion(packageRoot: string): string {
	const manifestPath = path.join(packageRoot, "package.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid Jihye package metadata at ${manifestPath}: ${detail}`);
	}
	if (!isRecord(parsed) || !nonEmptyString(parsed.version)) {
		throw new Error(`Invalid Jihye package metadata at ${manifestPath}: version must be a non-empty string`);
	}
	return parsed.version;
}

export function createJihyeRuntimeMetadata(
	jihyeVersion: string,
	profile: WorkspaceProfile,
	piVersion: string,
): JihyeRuntimeMetadata {
	return {
		schemaVersion: JIHYE_RUNTIME_SCHEMA_VERSION,
		jihyeVersion,
		profile,
		piVersion,
	};
}

export function parseJihyeRuntimeMetadata(value: unknown): JihyeRuntimeMetadata | undefined {
	if (!isRecord(value)
		|| !isPositiveInteger(value.schemaVersion)
		|| !nonEmptyString(value.jihyeVersion)
		|| !nonEmptyString(value.profile)
		|| !nonEmptyString(value.piVersion)) {
		return undefined;
	}
	return {
		schemaVersion: value.schemaVersion,
		jihyeVersion: value.jihyeVersion,
		profile: value.profile,
		piVersion: value.piVersion,
	};
}

export function latestJihyeRuntimeMetadata(
	entries: readonly RuntimeEntryLike[],
): JihyeRuntimeMetadata | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index]!;
		if (entry.type !== "custom" || entry.customType !== JIHYE_RUNTIME_ENTRY_TYPE) continue;
		return parseJihyeRuntimeMetadata(entry.data);
	}
	return undefined;
}

function sameRuntime(left: JihyeRuntimeMetadata, right: JihyeRuntimeMetadata): boolean {
	return left.schemaVersion === right.schemaVersion
		&& left.jihyeVersion === right.jihyeVersion
		&& left.profile === right.profile
		&& left.piVersion === right.piVersion;
}

export function ensureJihyeRuntimeMarker(
	entries: readonly RuntimeEntryLike[],
	metadata: JihyeRuntimeMetadata,
	append: (customType: string, data: JihyeRuntimeMetadata) => void,
): boolean {
	const latest = latestJihyeRuntimeMetadata(entries);
	if (latest && sameRuntime(latest, metadata)) return false;
	append(JIHYE_RUNTIME_ENTRY_TYPE, metadata);
	return true;
}
