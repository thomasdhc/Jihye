import { execFile, spawn, type ChildProcess } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { VoiceConfig } from "./config.ts";

export interface Command {
	command: string;
	args: string[];
}

/** Sixteen-kilohertz mono PCM is what the whisper models expect. */
export const CAPTURE_RATE_HZ = 16000;

/** Below this size a capture holds no usable speech. */
export const MINIMUM_USEFUL_WAV_BYTES = 8000;

export function buildRecordCommand(config: VoiceConfig, wavPath: string): Command {
	return {
		command: "arecord",
		args: [
			"-q",
			"-D",
			config.device,
			"-f",
			"S16_LE",
			"-r",
			String(CAPTURE_RATE_HZ),
			"-c",
			"1",
			"-t",
			"wav",
			"-d",
			String(config.maxSeconds),
			wavPath,
		],
	};
}

export function buildTranscribeCommand(config: VoiceConfig, wavPath: string): Command {
	return {
		command: config.whisperBin,
		args: ["-m", config.model, "-f", wavPath, "-np", "-nt", "-t", String(config.threads)],
	};
}

const NOISE_MARKERS = /\[(BLANK_AUDIO|INAUDIBLE|SILENCE|MUSIC|NOISE|SOUND)\]/gi;

/**
 * Reduce whisper output to plain prose. Timestamps, bracketed non-speech markers, and
 * parenthesized stage directions are transcription artifacts, not words the speaker said.
 */
export function cleanTranscript(raw: string): string {
	return raw
		.replace(/^\s*\[[0-9:.\s>-]+\]\s*/gm, "")
		.replace(NOISE_MARKERS, " ")
		.replace(/^\s*\((?:[^()]*)\)\s*$/gm, "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

export function createCapturePath(now: number = Date.now()): string {
	return join(tmpdir(), `pi-voice-${now}-${Math.random().toString(36).slice(2, 8)}.wav`);
}

export interface ActiveRecording {
	path: string;
	stop: () => Promise<void>;
}

/** Start capture. `arecord` finalizes the WAV header when interrupted, so stop uses SIGINT. */
export function startRecording(config: VoiceConfig, path: string = createCapturePath()): ActiveRecording {
	const { command, args } = buildRecordCommand(config, path);
	const child: ChildProcess = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });

	let stderr = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	const exited = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => {
			if (code !== null && code > 1) {
				reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
				return;
			}
			resolve();
		});
	});

	return {
		path,
		stop: async () => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGINT");
			await exited;
		},
	};
}

export async function capturedBytes(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch {
		return 0;
	}
}

export async function discardCapture(path: string): Promise<void> {
	await rm(path, { force: true }).catch(() => undefined);
}

export function transcribe(config: VoiceConfig, wavPath: string): Promise<string> {
	const { command, args } = buildTranscribeCommand(config, wavPath);
	return new Promise((resolve, reject) => {
		execFile(command, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim() || error.message));
				return;
			}
			resolve(cleanTranscript(stdout));
		});
	});
}
