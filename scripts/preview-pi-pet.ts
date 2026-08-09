import { pathToFileURL } from "node:url";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_STATES,
	validatePiPetAssets,
} from "../extensions/widget/pi-pet-assets.ts";
import { renderPiPetStateLines } from "../extensions/widget/pi-pet.ts";

const CLEAR_SCREEN = "\u001b[2J\u001b[H";

export function formatPiPetPreview(): string {
	validatePiPetAssets();

	const sprites: Array<[label: string, agentName?: string]> = [
		["default"],
		...Object.keys(PI_PET_ASSETS.subagents).map((name) => [`subagent:${name}`, name] as const),
	];
	const border = `+${"-".repeat(PI_PET_ASSETS.frameWidth)}+`;
	const cellWidth = visibleWidth(border);
	const columnGap = "  ";
	const output = [
		`Pi pet sprite preview (${PI_PET_ASSETS.frameWidth}-column frames)`,
		"Whitespace is visible between the | boundaries.",
		"",
	];

	for (const [label, agentName] of sprites) {
		const frames = PI_PET_STATES.map((state) => {
			const lines = renderPiPetStateLines(state, agentName);
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
		const joinColumns = (cells: string[]) => cells.map((cell) => cell.padEnd(cellWidth)).join(columnGap).trimEnd();

		output.push(
			label,
			joinColumns([...PI_PET_STATES]),
			joinColumns(PI_PET_STATES.map(() => border)),
			...frames[0].map((_line, row) => joinColumns(frames.map((lines) => `|${lines[row]}|`))),
			joinColumns(PI_PET_STATES.map(() => border)),
			"",
		);
	}

	return output.join("\n").trimEnd();
}

function main(): void {
	const watchMode = process.argv.includes("--watch-mode");
	process.stdout.write(`${watchMode ? CLEAR_SCREEN : ""}${formatPiPetPreview()}\n`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
