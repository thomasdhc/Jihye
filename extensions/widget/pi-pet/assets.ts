import { visibleWidth } from "@earendil-works/pi-tui";

export const PI_PET_STATES = ["idle", "thinking", "working", "success", "error"] as const;

export type PiPetState = (typeof PI_PET_STATES)[number];

export type PiPetElement = string | readonly [string, ...string[]];
export type PiPetElements = readonly [PiPetElement, PiPetElement, PiPetElement];
export type PiPetStateFrameMap = Readonly<Record<PiPetState, PiPetElement>>;

export interface PiPetNamedRowFrameMaps {
	readonly top: PiPetStateFrameMap;
	readonly face: PiPetStateFrameMap;
	readonly bottom: PiPetStateFrameMap;
}

export interface PiPetStateAsset {
	readonly elements: PiPetElements;
	readonly intervalMs?: number;
}

export type PiPetModeAssets = Readonly<Record<PiPetState, PiPetStateAsset>>;

export interface PiPetAssetCatalog {
	readonly frameWidth: number;
	readonly defaultIntervalMs: number;
	readonly default: PiPetModeAssets;
	readonly subagents: Readonly<Record<string, PiPetModeAssets>>;
}

export const PI_PET_FRAME_WIDTH = 7;
export const PI_PET_DEFAULT_ANIMATION_INTERVAL_MS = 800;

export function createPiPetModeAssets(rows: PiPetNamedRowFrameMaps): PiPetModeAssets {
	return Object.fromEntries(
		PI_PET_STATES.map((state) => [
			state,
			{ elements: [rows.top[state], rows.face[state], rows.bottom[state]] as const },
		]),
	) as PiPetModeAssets;
}

function repeatPiPetElement(element: PiPetElement): PiPetStateFrameMap {
	return {
		idle: element,
		thinking: element,
		working: element,
		success: element,
		error: element,
	};
}

const CAT_FACES: PiPetStateFrameMap = {
	idle: ["( o˽o )", "( o˽o )", "( ȏ˽ȏ )", "( ȏ˽ȏ )"],
	thinking: ["( ╸˽╺ )", "( ╸˽╺ )", "( ╴˽╶ )", "( ╴˽╶ )"],
	working: ["( o˽o )", "( o˽o )", "( ȏ˽ȏ )", "( ȏ˽ȏ )"],
	success: ["( ^‿^ )", "( ^‿^ )", "( ȏ‿ȏ )", "( ȏ‿ȏ )"],
	error: ["( x⁔x )", "( x⁔x )", "( ╸⁔╺ )", "( ╸⁔╺ )"],
};

const DEFAULT_TOP = " /\\_/\\ ";

export const DEFAULT_PI_PET_ASSETS = createPiPetModeAssets({
	top: repeatPiPetElement(DEFAULT_TOP),
	face: CAT_FACES,
	bottom: {
		idle: [" > ▵ < ", " > ▵ < ", " ▹ ▵ ◃ ", " ▹ ▵ ◃ "],
		thinking: [" > 🬃 < ", " > 🬖 < ", " > 🬞 < ", " > 🬢 < "],
		working: [" > ◐ < ", " > ◓ < ", " > ◑ < ", " > ◒ < "],
		success: [" > ★ < ", " > ★ < ", " ▹ ★ ◃ ", " ▹ ★ ◃ "],
		error: [" > ! < ", " > ! < ", " ▹ ! ◃ ", " ▹ ! ◃ "],
	},
});

export const SUBAGENT_PI_PET_ASSETS = {
	scout: createPiPetModeAssets({
		top: repeatPiPetElement(" /\\ /\\ "),
		face: {
			idle: " (o|o) ",
			thinking: " (-|-) ",
			working: " (o|o) ",
			success: " (^|^) ",
			error: " (x|x) ",
		},
		bottom: {
			idle: " / V \\ ",
			thinking: " / V \\ ",
			working: [" / V \\ ", " / v \\ "],
			success: " / V \\ ",
			error: " / V \\ ",
		},
	}),
	researcher: createPiPetModeAssets({
		top: repeatPiPetElement(" ,___, "),
		face: {
			idle: " (o,o) ",
			thinking: " (-,-) ",
			working: " (o,o) ",
			success: " (^,^) ",
			error: " (x,x) ",
		},
		bottom: {
			idle: " /===\\ ",
			thinking: " /===\\ ",
			working: [" /===\\ ", " /-=-\\ "],
			success: " /===\\ ",
			error: " /===\\ ",
		},
	}),
	reviewer: createPiPetModeAssets({
		top: repeatPiPetElement(" .---. "),
		face: {
			idle: " (o)-Q ",
			thinking: " (?)-Q ",
			working: " (o)-Q ",
			success: " (+)-Q ",
			error: " (x)-Q ",
		},
		bottom: {
			idle: " /___\\ ",
			thinking: " /___\\ ",
			working: [" /___\\ ", " /_-_\\ "],
			success: " /___\\ ",
			error: " /___\\ ",
		},
	}),
	engineer: createPiPetModeAssets({
		top: repeatPiPetElement(" /===\\ "),
		face: CAT_FACES,
		bottom: {
			idle: " /|_|\\ ",
			thinking: " /|_|\\ ",
			working: [" /|_|\\ ", " /|#|\\ "],
			success: " /|_|\\ ",
			error: " /|_|\\ ",
		},
	}),
} satisfies Readonly<Record<string, PiPetModeAssets>>;

export const PI_PET_ASSETS: PiPetAssetCatalog = {
	frameWidth: PI_PET_FRAME_WIDTH,
	defaultIntervalMs: PI_PET_DEFAULT_ANIMATION_INTERVAL_MS,
	default: DEFAULT_PI_PET_ASSETS,
	subagents: SUBAGENT_PI_PET_ASSETS,
};

export function getPiPetModeAssets(
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): PiPetModeAssets {
	return agentName ? (assets.subagents[agentName] ?? assets.default) : assets.default;
}

export function getPiPetStateAsset(
	state: PiPetState,
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): PiPetStateAsset {
	return getPiPetModeAssets(agentName, assets)[state];
}

export function getPiPetElementAlternativeCount(element: PiPetElement): number {
	return typeof element === "string" ? 1 : element.length;
}

export function resolvePiPetElement(element: PiPetElement, tick: number): string {
	if (!Number.isInteger(tick) || tick < 0) {
		throw new Error(`[pi-pet assets] animation tick must be a non-negative integer; received ${tick}`);
	}
	return typeof element === "string" ? element : element[tick % element.length];
}

export function resolvePiPetStateElements(
	state: PiPetState,
	tick: number,
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): [string, string, string] {
	const { elements } = getPiPetStateAsset(state, agentName, assets);
	return elements.map((element) => resolvePiPetElement(element, tick)) as [string, string, string];
}

export function isPiPetStateAnimated(
	state: PiPetState,
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): boolean {
	return getPiPetStateAsset(state, agentName, assets).elements.some(
		(element) => getPiPetElementAlternativeCount(element) > 1,
	);
}

export function getPiPetAnimationInterval(
	state: PiPetState,
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): number {
	return getPiPetStateAsset(state, agentName, assets).intervalMs ?? assets.defaultIntervalMs;
}

function greatestCommonDivisor(left: number, right: number): number {
	while (right !== 0) [left, right] = [right, left % right];
	return left;
}

export function getPiPetStateCycleLength(
	state: PiPetState,
	agentName?: string,
	assets: PiPetAssetCatalog = PI_PET_ASSETS,
): number {
	return getPiPetStateAsset(state, agentName, assets).elements.reduce((cycle, element) => {
		const alternatives = getPiPetElementAlternativeCount(element);
		return (cycle * alternatives) / greatestCommonDivisor(cycle, alternatives);
	}, 1);
}

function validateElementAlternative(
	line: unknown,
	label: string,
	frameWidth: number,
): void {
	if (typeof line !== "string") {
		throw new Error(`[pi-pet assets] ${label} must be a string`);
	}
	if (line.includes("\n") || line.includes("\r")) {
		throw new Error(`[pi-pet assets] ${label} must be a single terminal line`);
	}
	const width = visibleWidth(line);
	if (width !== frameWidth) {
		throw new Error(
			`[pi-pet assets] ${label} has display width ${width}; expected ${frameWidth}: ${JSON.stringify(line)}`,
		);
	}
}

export function validatePiPetAssets(assets: PiPetAssetCatalog = PI_PET_ASSETS): void {
	if (!Number.isInteger(assets.frameWidth) || assets.frameWidth <= 0) {
		throw new Error(`[pi-pet assets] frame width must be a positive integer; received ${assets.frameWidth}`);
	}
	if (!Number.isInteger(assets.defaultIntervalMs) || assets.defaultIntervalMs <= 0) {
		throw new Error(
			`[pi-pet assets] default animation interval must be a positive integer; received ${assets.defaultIntervalMs}`,
		);
	}

	const modes: Array<[name: string, mode: PiPetModeAssets]> = [
		["default", assets.default],
		...Object.entries(assets.subagents).map(([name, mode]) => [`subagent:${name}`, mode] as const),
	];

	for (const [name, mode] of modes) {
		for (const state of PI_PET_STATES) {
			const stateAsset = mode[state];
			if (!stateAsset || !Array.isArray(stateAsset.elements) || stateAsset.elements.length !== 3) {
				throw new Error(`[pi-pet assets] ${name}.${state} must contain exactly 3 ordered elements`);
			}
			if (stateAsset.intervalMs !== undefined && (!Number.isInteger(stateAsset.intervalMs) || stateAsset.intervalMs <= 0)) {
				throw new Error(`[pi-pet assets] ${name}.${state} animation interval must be a positive integer`);
			}
			for (const [index, element] of stateAsset.elements.entries()) {
				const label = `${name}.${state} element ${index}`;
				if (typeof element === "string") {
					validateElementAlternative(element, label, assets.frameWidth);
					continue;
				}
				if (!Array.isArray(element) || element.length === 0) {
					throw new Error(`[pi-pet assets] ${label} alternatives must be a non-empty readonly list`);
				}
				for (const [alternative, line] of element.entries()) {
					validateElementAlternative(line, `${label} alternative ${alternative}`, assets.frameWidth);
				}
			}
		}
	}
}

validatePiPetAssets();
