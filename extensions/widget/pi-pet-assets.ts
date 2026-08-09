import { visibleWidth } from "@earendil-works/pi-tui";

export const PI_PET_STATES = ["idle", "thinking", "working", "success", "error"] as const;

export type PiPetState = (typeof PI_PET_STATES)[number];

export interface PiPetLayout {
	readonly top: string;
	readonly middle: Readonly<Record<PiPetState, string>>;
	readonly bottom: string | Readonly<Record<PiPetState, string>>;
}

export interface PiPetAssetCatalog {
	readonly frameWidth: number;
	readonly default: PiPetLayout;
	readonly subagents: Readonly<Record<string, PiPetLayout>>;
}

export const PI_PET_FRAME_WIDTH = 7;

const CAT_FACES = {
	idle: "( o.o )",
	thinking: "( -.- )",
	working: "( o.o )",
	success: "( ^.^ )",
	error: "( x.x )",
} satisfies Record<PiPetState, string>;

export const DEFAULT_PI_PET_LAYOUT = {
	top: " /\\_/\\ ",
	middle: CAT_FACES,
	bottom: {
		idle: " > ^ < ",
		thinking: " > ? < ",
		working: " /|_|\\ ",
		success: " > ★ < ",
		error: " > ! < ",
	},
} satisfies PiPetLayout;

export const SUBAGENT_PI_PET_LAYOUTS = {
	scout: {
		top: " /\\ /\\ ",
		middle: {
			idle: " (o|o) ",
			thinking: " (-|-) ",
			working: " (o|o) ",
			success: " (^|^) ",
			error: " (x|x) ",
		},
		bottom: " / V \\ ",
	},
	researcher: {
		top: " ,___, ",
		middle: {
			idle: " (o,o) ",
			thinking: " (-,-) ",
			working: " (o,o) ",
			success: " (^,^) ",
			error: " (x,x) ",
		},
		bottom: " /===\\ ",
	},
	reviewer: {
		top: " .---. ",
		middle: {
			idle: " (o)-Q ",
			thinking: " (?)-Q ",
			working: " (o)-Q ",
			success: " (+)-Q ",
			error: " (x)-Q ",
		},
		bottom: " /___\\ ",
	},
	engineer: {
		top: " /===\\ ",
		middle: CAT_FACES,
		bottom: " /|_|\\ ",
	},
	coordinator: {
		top: " \\ | / ",
		middle: CAT_FACES,
		bottom: " /_^_\\ ",
	},
} satisfies Record<string, PiPetLayout>;

export const PI_PET_ASSETS: PiPetAssetCatalog = {
	frameWidth: PI_PET_FRAME_WIDTH,
	default: DEFAULT_PI_PET_LAYOUT,
	subagents: SUBAGENT_PI_PET_LAYOUTS,
};

function layoutLines(layout: PiPetLayout, state: PiPetState): Array<[row: string, line: string]> {
	return [
		["top", layout.top],
		["middle", layout.middle[state]],
		["bottom", typeof layout.bottom === "string" ? layout.bottom : layout.bottom[state]],
	];
}

export function validatePiPetAssets(assets: PiPetAssetCatalog = PI_PET_ASSETS): void {
	if (!Number.isInteger(assets.frameWidth) || assets.frameWidth <= 0) {
		throw new Error(`[pi-pet assets] frame width must be a positive integer; received ${assets.frameWidth}`);
	}

	const layouts: Array<[name: string, layout: PiPetLayout]> = [
		["default", assets.default],
		...Object.entries(assets.subagents).map(([name, layout]) => [`subagent:${name}`, layout] as const),
	];

	for (const [name, layout] of layouts) {
		for (const state of PI_PET_STATES) {
			for (const [row, line] of layoutLines(layout, state)) {
				if (line.includes("\n") || line.includes("\r")) {
					throw new Error(`[pi-pet assets] ${name}.${state} ${row} must be a single terminal line`);
				}
				const width = visibleWidth(line);
				if (width !== assets.frameWidth) {
					throw new Error(
						`[pi-pet assets] ${name}.${state} ${row} has display width ${width}; expected ${assets.frameWidth}: ${JSON.stringify(line)}`,
					);
				}
			}
		}
	}
}

validatePiPetAssets();
