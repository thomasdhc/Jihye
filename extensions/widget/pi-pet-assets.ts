import { visibleWidth } from "@earendil-works/pi-tui";

export const PI_PET_STATES = ["idle", "thinking", "working", "success", "error"] as const;

export type PiPetState = (typeof PI_PET_STATES)[number];

export type PiPetElement = string | readonly [string, ...string[]];
export type PiPetElements = readonly [PiPetElement, PiPetElement, PiPetElement];

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
export const PI_PET_DEFAULT_ANIMATION_INTERVAL_MS = 250;

const CAT_FACES = {
	idle: "( o˽o )",
	thinking: "( -˽- )",
	working: "( o˽o )",
	success: "( ^‿^ )",
	error: "( x⁔x )",
} satisfies Record<PiPetState, string>;

const DEFAULT_TOP = " /\\_/\\ ";

export const DEFAULT_PI_PET_ASSETS = {
	idle: { elements: [DEFAULT_TOP, CAT_FACES.idle, " > ^ < "] },
	thinking: { elements: [DEFAULT_TOP, CAT_FACES.thinking, " > ? < "] },
	working: {
		elements: [DEFAULT_TOP, CAT_FACES.working, [" > ◐ < ", " > ◓ < ", " > ◑ < ", " > ◒ < "]],
	},
	success: { elements: [DEFAULT_TOP, CAT_FACES.success, " > ★ < "] },
	error: { elements: [DEFAULT_TOP, CAT_FACES.error, " > ! < "] },
} as const satisfies PiPetModeAssets;

export const SUBAGENT_PI_PET_ASSETS = {
	scout: {
		idle: { elements: [" /\\ /\\ ", " (o|o) ", " / V \\ "] },
		thinking: { elements: [" /\\ /\\ ", " (-|-) ", " / V \\ "] },
		working: { elements: [" /\\ /\\ ", " (o|o) ", [" / V \\ ", " / v \\ "]] },
		success: { elements: [" /\\ /\\ ", " (^|^) ", " / V \\ "] },
		error: { elements: [" /\\ /\\ ", " (x|x) ", " / V \\ "] },
	},
	researcher: {
		idle: { elements: [" ,___, ", " (o,o) ", " /===\\ "] },
		thinking: { elements: [" ,___, ", " (-,-) ", " /===\\ "] },
		working: { elements: [" ,___, ", " (o,o) ", [" /===\\ ", " /-=-\\ "]] },
		success: { elements: [" ,___, ", " (^,^) ", " /===\\ "] },
		error: { elements: [" ,___, ", " (x,x) ", " /===\\ "] },
	},
	reviewer: {
		idle: { elements: [" .---. ", " (o)-Q ", " /___\\ "] },
		thinking: { elements: [" .---. ", " (?)-Q ", " /___\\ "] },
		working: { elements: [" .---. ", " (o)-Q ", [" /___\\ ", " /_-_\\ "]] },
		success: { elements: [" .---. ", " (+)-Q ", " /___\\ "] },
		error: { elements: [" .---. ", " (x)-Q ", " /___\\ "] },
	},
	engineer: {
		idle: { elements: [" /===\\ ", CAT_FACES.idle, " /|_|\\ "] },
		thinking: { elements: [" /===\\ ", CAT_FACES.thinking, " /|_|\\ "] },
		working: { elements: [" /===\\ ", CAT_FACES.working, [" /|_|\\ ", " /|#|\\ "]] },
		success: { elements: [" /===\\ ", CAT_FACES.success, " /|_|\\ "] },
		error: { elements: [" /===\\ ", CAT_FACES.error, " /|_|\\ "] },
	},
	coordinator: {
		idle: { elements: [" \\ | / ", CAT_FACES.idle, " /_^_\\ "] },
		thinking: { elements: [" \\ | / ", CAT_FACES.thinking, " /_^_\\ "] },
		working: { elements: [[" \\ | / ", " / | \\ "], CAT_FACES.working, " /_^_\\ "] },
		success: { elements: [" \\ | / ", CAT_FACES.success, " /_^_\\ "] },
		error: { elements: [" \\ | / ", CAT_FACES.error, " /_^_\\ "] },
	},
} as const satisfies Record<string, PiPetModeAssets>;

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
