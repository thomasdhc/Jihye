import { homedir } from "node:os";
import { join } from "node:path";

export interface VoiceConfig {
	/** ALSA capture device passed to the recorder. */
	device: string;
	/** Path to the `whisper-cli` binary, or a bare name resolved on `PATH`. */
	whisperBin: string;
	/** Path to the ggml model file the binary loads. */
	model: string;
	/** Decoder threads. */
	threads: number;
	/** Send the transcript as a user message instead of inserting it for review. */
	autoSend: boolean;
	/** Hard cap on a single recording, so a forgotten session cannot fill the disk. */
	maxSeconds: number;
}

export type VoiceSettingSource = "default" | "file" | "environment";

export interface ResolvedVoiceConfig {
	config: VoiceConfig;
	sources: Record<keyof VoiceConfig, VoiceSettingSource>;
}

const WHISPER_HOME = join(homedir(), ".local", "opt", "whisper.cpp");

export const VOICE_DEFAULTS: VoiceConfig = {
	device: "default",
	whisperBin: join(WHISPER_HOME, "build", "bin", "whisper-cli"),
	model: join(WHISPER_HOME, "models", "ggml-base.en.bin"),
	threads: 4,
	autoSend: true,
	maxSeconds: 900,
};

const ENVIRONMENT_KEYS: Record<keyof VoiceConfig, string> = {
	device: "PI_VOICE_DEVICE",
	whisperBin: "PI_VOICE_WHISPER_BIN",
	model: "PI_VOICE_MODEL",
	threads: "PI_VOICE_THREADS",
	autoSend: "PI_VOICE_AUTO_SEND",
	maxSeconds: "PI_VOICE_MAX_SECONDS",
};

type Environment = Readonly<Record<string, string | undefined>>;

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
	const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.floor(parsed);
}

function parseText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

const PARSERS: { [K in keyof VoiceConfig]: (value: unknown) => VoiceConfig[K] | undefined } = {
	device: parseText,
	whisperBin: parseText,
	model: parseText,
	threads: parsePositiveInteger,
	autoSend: parseBoolean,
	maxSeconds: parsePositiveInteger,
};

/**
 * Resolve configuration with a fixed precedence: environment over user file over defaults.
 * Unparseable values fall through to the next source rather than failing the extension.
 */
export function resolveVoiceConfig(file: unknown, environment: Environment = {}): ResolvedVoiceConfig {
	const fileRecord = (file && typeof file === "object" ? file : {}) as Record<string, unknown>;
	const config = { ...VOICE_DEFAULTS };
	const sources = {} as Record<keyof VoiceConfig, VoiceSettingSource>;

	for (const key of Object.keys(VOICE_DEFAULTS) as (keyof VoiceConfig)[]) {
		const parse = PARSERS[key] as (value: unknown) => VoiceConfig[typeof key] | undefined;
		const fromEnvironment = parse(environment[ENVIRONMENT_KEYS[key]]);
		if (fromEnvironment !== undefined) {
			(config[key] as VoiceConfig[typeof key]) = fromEnvironment;
			sources[key] = "environment";
			continue;
		}

		const fromFile = parse(fileRecord[key]);
		if (fromFile !== undefined) {
			(config[key] as VoiceConfig[typeof key]) = fromFile;
			sources[key] = "file";
			continue;
		}

		sources[key] = "default";
	}

	return { config, sources };
}

/** Location of the optional user configuration file. */
export function voiceConfigPath(environment: Environment = process.env): string {
	const agentDirectory = parseText(environment.PI_CODING_AGENT_DIR) ?? join(homedir(), ".pi", "agent");
	return join(agentDirectory, "voice.json");
}
