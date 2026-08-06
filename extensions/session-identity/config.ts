import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const SESSION_NAME_POOL = [
	"Aqila",
	"Athena",
	"Ji-hye",
	"Cyrus",
	"Lozen",
	"Odin",
	"Augustine",
	"Manuela",
] as const;

export interface SessionIdentityConfig {
	stateDirectory: string;
	pool: readonly string[];
	fallbackPrefix: string;
	fallbackMinimumDigits: number;
	lockTimeoutMs: number;
	lockRetryMs: number;
	orphanLockGraceMs: number;
}

export function createSessionIdentityConfig(
	agentDirectory = getAgentDir(),
): SessionIdentityConfig {
	return {
		stateDirectory: join(agentDirectory, "state", "session-identity"),
		pool: SESSION_NAME_POOL,
		fallbackPrefix: "pi-agent",
		fallbackMinimumDigits: 2,
		lockTimeoutMs: 5_000,
		lockRetryMs: 20,
		orphanLockGraceMs: 2_000,
	};
}
