import assert from "node:assert/strict";
import test from "node:test";

import { resolveVoiceConfig, VOICE_DEFAULTS, voiceConfigPath } from "../extensions/voice/config.ts";
import { voicePhaseContribution } from "../extensions/voice/index.ts";
import { renderCompanionWidgetLines } from "../extensions/widget/index.ts";
import {
	buildRecordCommand,
	buildTranscribeCommand,
	CAPTURE_RATE_HZ,
	cleanTranscript,
	createCapturePath,
} from "../extensions/voice/recorder.ts";

test("publishes compact voice phases below the session identity", () => {
	const recording = voicePhaseContribution("recording");
	const transcribing = voicePhaseContribution("transcribing");

	assert.deepEqual(recording, {
		id: "voice",
		region: "details",
		order: 40,
		lines: ["● REC"],
		tone: "error",
	});
	assert.deepEqual(transcribing, {
		id: "voice",
		region: "details",
		order: 40,
		lines: ["○ TRANSCRIBING"],
		tone: "accent",
	});
	assert.equal(voicePhaseContribution("idle"), undefined);
	assert.deepEqual(
		renderCompanionWidgetLines([
			{ id: "session-identity", region: "details", order: 30, lines: ["Agent One"], tone: "accent" },
			recording!,
		], (tone, text) => `${tone}:${text}`),
		["accent:Agent One", "error:● REC"],
	);
});

test("resolves defaults when no file or environment settings exist", () => {
	const { config, sources } = resolveVoiceConfig({}, {});
	assert.deepEqual(config, VOICE_DEFAULTS);
	assert.match(config.model, /ggml-small\.en\.bin$/);
	assert.equal(sources.device, "default");
	assert.equal(sources.autoSend, "default");
});

test("prefers environment over file over default", () => {
	const { config, sources } = resolveVoiceConfig(
		{ device: "hw:1,0", model: "/models/file.bin", threads: 6 },
		{ PI_VOICE_MODEL: "/models/env.bin" },
	);
	assert.equal(config.model, "/models/env.bin");
	assert.equal(sources.model, "environment");
	assert.equal(config.device, "hw:1,0");
	assert.equal(sources.device, "file");
	assert.equal(config.threads, 6);
	assert.equal(config.whisperBin, VOICE_DEFAULTS.whisperBin);
	assert.equal(sources.whisperBin, "default");
});

test("parses boolean and numeric settings from string environment values", () => {
	assert.equal(resolveVoiceConfig({}, { PI_VOICE_AUTO_SEND: "off" }).config.autoSend, false);
	assert.equal(resolveVoiceConfig({}, { PI_VOICE_AUTO_SEND: "TRUE" }).config.autoSend, true);
	assert.equal(resolveVoiceConfig({}, { PI_VOICE_THREADS: "12" }).config.threads, 12);
	assert.equal(resolveVoiceConfig({}, { PI_VOICE_MAX_SECONDS: "60" }).config.maxSeconds, 60);
});

test("falls through to the next source when a value cannot be parsed", () => {
	const { config, sources } = resolveVoiceConfig({ threads: 8 }, { PI_VOICE_THREADS: "-3" });
	assert.equal(config.threads, 8);
	assert.equal(sources.threads, "file");

	const blank = resolveVoiceConfig({ device: "   " }, {});
	assert.equal(blank.config.device, VOICE_DEFAULTS.device);
	assert.equal(blank.sources.device, "default");
});

test("tolerates a malformed configuration file instead of failing", () => {
	assert.deepEqual(resolveVoiceConfig("not an object", {}).config, VOICE_DEFAULTS);
	assert.deepEqual(resolveVoiceConfig(null, {}).config, VOICE_DEFAULTS);
});

test("honours a custom agent directory for the configuration path", () => {
	assert.equal(voiceConfigPath({ PI_CODING_AGENT_DIR: "/tmp/agent" }), "/tmp/agent/voice.json");
});

test("builds a mono sixteen-kilohertz capture command bounded by the recording cap", () => {
	const { command, args } = buildRecordCommand({ ...VOICE_DEFAULTS, device: "hw:1,0", maxSeconds: 60 }, "/tmp/a.wav");
	assert.equal(command, "arecord");
	assert.deepEqual(args, [
		"-q",
		"-D",
		"hw:1,0",
		"-f",
		"S16_LE",
		"-r",
		String(CAPTURE_RATE_HZ),
		"-c",
		"1",
		"-t",
		"wav",
		"-d",
		"60",
		"/tmp/a.wav",
	]);
});

test("builds a transcription command with progress and timestamps suppressed", () => {
	const { command, args } = buildTranscribeCommand(
		{ ...VOICE_DEFAULTS, whisperBin: "/bin/whisper-cli", model: "/m.bin", threads: 8 },
		"/tmp/a.wav",
	);
	assert.equal(command, "/bin/whisper-cli");
	assert.deepEqual(args, ["-m", "/m.bin", "-f", "/tmp/a.wav", "-np", "-nt", "-t", "8"]);
});

test("cleans timestamps, non-speech markers, and stage directions out of a transcript", () => {
	const raw = [
		"[00:00:00.000 --> 00:00:04.000]   So the first thing I want to clarify",
		"[00:00:04.000 --> 00:00:08.000]   is the job mix. [BLANK_AUDIO]",
		"(keyboard clacking)",
		"",
		"   Then quotas.   ",
	].join("\n");
	assert.equal(cleanTranscript(raw), "So the first thing I want to clarify is the job mix. Then quotas.");
});

test("returns an empty transcript when the capture held no speech", () => {
	assert.equal(cleanTranscript("[BLANK_AUDIO]\n\n"), "");
	assert.equal(cleanTranscript("   "), "");
});

test("creates unique capture paths", () => {
	const first = createCapturePath(1);
	const second = createCapturePath(1);
	assert.notEqual(first, second);
	assert.match(first, /pi-voice-1-[a-z0-9]+\.wav$/);
});
