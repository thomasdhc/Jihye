import { pathToFileURL } from "node:url";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_STATES,
	getPiPetAnimationInterval,
	getPiPetStateCycleLength,
	isPiPetStateAnimated,
	validatePiPetAssets,
} from "../extensions/widget/pi-pet/assets.ts";
import { renderPiPetStateLines } from "../extensions/widget/pi-pet/extension.ts";

const CLEAR_SCREEN = "\u001b[2J\u001b[H";

export interface PiPetPreviewOptions {
	sprite?: string;
	elapsedMs?: number;
}

export interface PiPetPreviewArguments {
	watchMode: boolean;
	sprite?: string;
}

export function getPiPetSpriteOptions(): string[] {
	return ["default", ...Object.keys(PI_PET_ASSETS.subagents)];
}

function assertValidSprite(sprite?: string): void {
	if (sprite === undefined || getPiPetSpriteOptions().includes(sprite)) return;
	throw new Error(
		`Invalid --sprite choice ${JSON.stringify(sprite)}. Options: ${getPiPetSpriteOptions().join(", ")}`,
	);
}

export function parsePiPetPreviewArgs(args: readonly string[]): PiPetPreviewArguments {
	let watchMode = false;
	let sprite: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--watch-mode") {
			watchMode = true;
			continue;
		}
		if (argument === "--sprite") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for --sprite. Options: ${getPiPetSpriteOptions().join(", ")}`);
			}
			sprite = value;
			index += 1;
			continue;
		}
		if (argument.startsWith("--sprite=")) {
			sprite = argument.slice("--sprite=".length);
			continue;
		}
		throw new Error(`Unknown pi-pet preview option: ${argument}`);
	}

	assertValidSprite(sprite);
	return { watchMode, sprite };
}

function selectedSprites(sprite?: string): Array<[label: string, agentName?: string]> {
	assertValidSprite(sprite);
	if (sprite === "default") return [["default"]];
	if (sprite) return [[`subagent:${sprite}`, sprite]];
	return [
		["default"],
		...Object.keys(PI_PET_ASSETS.subagents).map((name) => [`subagent:${name}`, name] as const),
	];
}

function greatestCommonDivisor(left: number, right: number): number {
	while (right !== 0) [left, right] = [right, left % right];
	return left;
}

export function getPiPetPreviewRefreshInterval(sprite?: string): number {
	const intervals = selectedSprites(sprite).flatMap(([, agentName]) =>
		PI_PET_STATES
			.filter((state) => isPiPetStateAnimated(state, agentName))
			.map((state) => getPiPetAnimationInterval(state, agentName)),
	);
	return intervals.reduce(greatestCommonDivisor, PI_PET_ASSETS.defaultIntervalMs);
}

export function formatPiPetPreview(options: PiPetPreviewOptions = {}): string {
	validatePiPetAssets();
	const elapsedMs = options.elapsedMs ?? 0;
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
		throw new Error(`[pi-pet preview] elapsedMs must be a non-negative number; received ${elapsedMs}`);
	}

	const sprites = selectedSprites(options.sprite);
	const border = `+${"-".repeat(PI_PET_ASSETS.frameWidth)}+`;
	const columnGap = "  ";
	const output = [
		`Pi pet sprite preview (${PI_PET_ASSETS.frameWidth}-column frames)`,
		"Whitespace is visible between the | boundaries; ×N labels show animation cycle lengths.",
		"",
	];

	for (const [label, agentName] of sprites) {
		const headings = PI_PET_STATES.map((state) => {
			const cycleLength = getPiPetStateCycleLength(state, agentName);
			return cycleLength > 1 ? `${state}×${cycleLength}` : state;
		});
		const cellWidth = Math.max(visibleWidth(border), ...headings.map(visibleWidth));
		const frames = PI_PET_STATES.map((state) => {
			const intervalMs = getPiPetAnimationInterval(state, agentName);
			const tick = Math.floor(elapsedMs / intervalMs);
			const lines = renderPiPetStateLines(state, agentName, tick);
			for (const line of lines) {
				const width = visibleWidth(line);
				if (width !== PI_PET_ASSETS.frameWidth) {
					throw new Error(
						`[pi-pet preview] ${label}.${state} rendered display width ${width}; expected ${PI_PET_ASSETS.frameWidth}: ${JSON.stringify(line)}`,
					);
				}
			}
			return lines;
		});
		const joinColumns = (cells: string[]) => cells
			.map((cell) => cell + " ".repeat(cellWidth - visibleWidth(cell)))
			.join(columnGap)
			.trimEnd();

		output.push(
			label,
			joinColumns(headings),
			joinColumns(PI_PET_STATES.map(() => border)),
			...frames[0].map((_line, row) => joinColumns(frames.map((lines) => `|${lines[row]}|`))),
			joinColumns(PI_PET_STATES.map(() => border)),
			"",
		);
	}

	return output.join("\n").trimEnd();
}

function main(): void {
	try {
		const { watchMode, sprite } = parsePiPetPreviewArgs(process.argv.slice(2));
		if (!watchMode) {
			process.stdout.write(`${formatPiPetPreview({ sprite })}\n`);
			return;
		}

		const startedAt = Date.now();
		const render = () => {
			process.stdout.write(`${CLEAR_SCREEN}${formatPiPetPreview({ sprite, elapsedMs: Date.now() - startedAt })}\n`);
		};
		render();
		setInterval(render, getPiPetPreviewRefreshInterval(sprite));
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
