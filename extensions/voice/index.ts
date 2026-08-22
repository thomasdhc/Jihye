import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	resolveVoiceConfig,
	VOICE_DEFAULTS,
	voiceConfigPath,
	type ResolvedVoiceConfig,
	type VoiceConfig,
} from "./config.ts";
import {
	capturedBytes,
	discardCapture,
	MINIMUM_USEFUL_WAV_BYTES,
	startRecording,
	transcribe,
	type ActiveRecording,
} from "./recorder.ts";

const SHORTCUT = "f9";
const STATUS_ID = "voice";

type Phase = "idle" | "recording" | "transcribing";

export async function loadVoiceConfig(environment = process.env): Promise<ResolvedVoiceConfig> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(voiceConfigPath(environment), "utf8"));
	} catch {
		parsed = {};
	}
	return resolveVoiceConfig(parsed, environment);
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function isReadable(path: string): Promise<boolean> {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

/** Report every missing prerequisite at once; a partial setup should not need three attempts. */
export async function missingPrerequisites(config: VoiceConfig): Promise<string[]> {
	const missing: string[] = [];
	if (!(await isExecutable(config.whisperBin))) missing.push(`whisper binary not executable: ${config.whisperBin}`);
	if (!(await isReadable(config.model))) missing.push(`model not readable: ${config.model}`);
	return missing;
}

export default function (pi: ExtensionAPI): void {
	let config: VoiceConfig = VOICE_DEFAULTS;
	let phase: Phase = "idle";
	let recording: ActiveRecording | null = null;

	function setPhase(ctx: ExtensionContext, next: Phase): void {
		phase = next;
		const theme = ctx.ui.theme;
		switch (phase) {
			case "recording":
				ctx.ui.setStatus(STATUS_ID, theme ? theme.fg("error", " recording") : " recording");
				break;
			case "transcribing":
				ctx.ui.setStatus(STATUS_ID, theme ? theme.fg("warning", " transcribing") : " transcribing");
				break;
			default:
				ctx.ui.setStatus(STATUS_ID, undefined);
		}
	}

	function report(ctx: ExtensionContext, prefix: string, error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`${prefix}: ${message.slice(0, 220)}`, "error");
	}

	async function deliver(ctx: ExtensionContext, transcript: string): Promise<void> {
		if (!config.autoSend) {
			const existing = ctx.ui.getEditorText?.() ?? "";
			ctx.ui.setEditorText(existing.trim().length > 0 ? `${existing.trimEnd()} ${transcript}` : transcript);
			return;
		}

		const idle = (await ctx.isIdle?.()) ?? true;
		pi.sendUserMessage(transcript, idle ? undefined : { deliverAs: "followUp" });
	}

	async function beginRecording(ctx: ExtensionContext): Promise<void> {
		const missing = await missingPrerequisites(config);
		if (missing.length > 0) {
			ctx.ui.notify(`Voice unavailable:\n  ${missing.join("\n  ")}`, "error");
			return;
		}

		try {
			recording = startRecording(config);
			setPhase(ctx, "recording");
		} catch (error) {
			recording = null;
			setPhase(ctx, "idle");
			report(ctx, "Voice capture", error);
		}
	}

	async function finishRecording(ctx: ExtensionContext): Promise<void> {
		const active = recording;
		if (!active) return;

		recording = null;
		setPhase(ctx, "transcribing");

		try {
			await active.stop();

			if ((await capturedBytes(active.path)) < MINIMUM_USEFUL_WAV_BYTES) {
				ctx.ui.notify("Voice: nothing recorded", "warning");
				return;
			}

			const transcript = await transcribe(config, active.path);
			if (transcript.length === 0) {
				ctx.ui.notify("Voice: no speech detected", "warning");
				return;
			}

			await deliver(ctx, transcript);
		} catch (error) {
			report(ctx, "Voice", error);
		} finally {
			await discardCapture(active.path);
			setPhase(ctx, "idle");
		}
	}

	async function toggle(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Voice requires interactive mode", "error");
			return;
		}

		if (phase === "transcribing") {
			ctx.ui.notify("Voice: still transcribing", "warning");
			return;
		}

		if (phase === "recording") {
			await finishRecording(ctx);
			return;
		}

		await beginRecording(ctx);
	}

	async function showStatus(ctx: ExtensionContext): Promise<void> {
		const { config: current, sources } = await loadVoiceConfig();
		config = current;
		const missing = await missingPrerequisites(current);
		ctx.ui.notify(
			[
				"Voice status:",
				"",
				`  state:     ${phase}`,
				`  shortcut:  ${SHORTCUT}`,
				`  device:    ${current.device} (${sources.device})`,
				`  binary:    ${current.whisperBin} (${sources.whisperBin})`,
				`  model:     ${current.model} (${sources.model})`,
				`  threads:   ${current.threads} (${sources.threads})`,
				`  auto-send: ${current.autoSend ? "yes" : "no"} (${sources.autoSend})`,
				`  config:    ${voiceConfigPath()}`,
				missing.length > 0 ? `\n  missing:   ${missing.join("\n             ")}` : "",
			]
				.filter((line) => line.length > 0 || line === "")
				.join("\n"),
			missing.length > 0 ? "warning" : "info",
		);
	}

	pi.registerCommand("voice", {
		description: `Start or stop voice capture (${SHORTCUT}); /voice status shows configuration`,
		handler: async (args, ctx) => {
			const argument = args.trim().toLowerCase();
			if (argument === "status") {
				await showStatus(ctx);
				return;
			}
			if (argument.length > 0) {
				ctx.ui.notify("Usage: /voice or /voice status", "warning");
				return;
			}
			await toggle(ctx);
		},
	});

	pi.registerShortcut(SHORTCUT, {
		description: "Start or stop voice capture",
		handler: async (ctx) => {
			await toggle(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		phase = "idle";
		recording = null;
		config = (await loadVoiceConfig()).config;
		ctx.ui.setStatus(STATUS_ID, undefined);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const active = recording;
		recording = null;
		phase = "idle";
		if (active) {
			await active.stop().catch(() => undefined);
			await discardCapture(active.path);
		}
		ctx.ui.setStatus(STATUS_ID, undefined);
	});
}
