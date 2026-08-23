/**
 * Preview the custom startup header outside Pi.
 *
 *   npm run preview:header
 *   npm run preview:header -- --mask --theme light
 *   npm run preview:header:watch
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Theme, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	CUSTOM_HEADER_ASSETS,
	getCustomHeaderArtWidth,
	validateCustomHeaderAssets,
} from "../extensions/custom-header/assets.ts";
import { renderCustomHeaderLines } from "../extensions/custom-header/render.ts";

const CLEAR_SCREEN = "\u001b[2J\u001b[H";
const BUNDLED_THEMES = ["dark", "light"] as const;

export interface HeaderPreviewArguments {
	watchMode: boolean;
	theme: string;
	mask: boolean;
}

export function parseHeaderPreviewArgs(args: readonly string[]): HeaderPreviewArguments {
	const parsed: HeaderPreviewArguments = { watchMode: false, theme: "dark", mask: false };

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--watch-mode") {
			parsed.watchMode = true;
			continue;
		}
		if (argument === "--mask") {
			parsed.mask = true;
			continue;
		}
		if (argument === "--theme" || argument.startsWith("--theme=")) {
			const value = argument.startsWith("--theme=") ? argument.slice("--theme=".length) : args[++index];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for --theme. Use ${BUNDLED_THEMES.join(", ")}, or a theme JSON path.`);
			}
			parsed.theme = value;
			continue;
		}
		throw new Error(`Unknown header preview option: ${argument}`);
	}

	return parsed;
}

function bundledThemePath(name: string): string {
	const distEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
	return path.join(path.dirname(distEntry), "modes/interactive/theme", `${name}.json`);
}

/** Load a Pi theme JSON file and resolve its `vars` indirections. */
export function loadPreviewTheme(name: string): Theme {
	const themePath = BUNDLED_THEMES.includes(name as (typeof BUNDLED_THEMES)[number])
		? bundledThemePath(name)
		: path.resolve(name);

	if (!fs.existsSync(themePath)) {
		throw new Error(`Theme not found: ${themePath}. Use ${BUNDLED_THEMES.join(", ")}, or a theme JSON path.`);
	}

	const json = JSON.parse(fs.readFileSync(themePath, "utf-8")) as {
		vars?: Record<string, string>;
		colors: Record<string, string>;
	};
	const vars = json.vars ?? {};
	const resolve = (value: string): string => (value.startsWith("#") ? value : (vars[value] ?? value));
	const colors = Object.fromEntries(Object.entries(json.colors).map(([key, value]) => [key, resolve(value)]));

	return new Theme(colors as never, colors as never, "truecolor", { name, sourcePath: themePath });
}

function describePalette(): string {
	const entries = Object.entries(CUSTOM_HEADER_ASSETS.palette).map(
		([key, style]) => `${key} → ${style.color}${style.bold ? " (bold)" : ""}`,
	);
	return `palette: ${entries.join(", ")}, ' ' → unpainted`;
}

export interface HeaderPreviewOptions {
	theme?: string;
	mask?: boolean;
}

export function formatHeaderPreview(options: HeaderPreviewOptions = {}): string {
	const themeName = options.theme ?? "dark";
	validateCustomHeaderAssets();

	const theme = loadPreviewTheme(themeName);
	const width = getCustomHeaderArtWidth();
	const border = `+${"-".repeat(width)}+`;
	const columnGap = "   ";

	const artLines = CUSTOM_HEADER_ASSETS.art.map((row) => `|${renderHeaderRowWithTheme(theme, row.art, row.ink)}|`);
	const maskLines = CUSTOM_HEADER_ASSETS.art.map((row) => `|${row.ink}|`);
	const grid = options.mask
		? [
			["art", "ink mask"].map((label) => label.padEnd(visibleWidth(border))).join(columnGap).trimEnd(),
			[border, border].join(columnGap),
			...artLines.map((line, index) => line + columnGap + maskLines[index]),
			[border, border].join(columnGap),
		]
		: [border, ...artLines, border];

	// Hint rendering reaches into Pi's global theme, so initialize it too.
	if (CUSTOM_HEADER_ASSETS.showHints) initTheme(themeName, false);

	return [
		`Custom header preview (${width}-column art, theme: ${themeName})`,
		"Edit extensions/custom-header/assets.ts; the | boundaries show the art block edges.",
		"",
		...grid,
		"",
		describePalette(),
		"",
		"as rendered:",
		...renderCustomHeaderLines(theme),
	].join("\n").replace(/\s+$/, "");
}

function renderHeaderRowWithTheme(theme: Theme, art: string, ink: string): string {
	// Reuse the extension renderer so the preview cannot drift from Pi's output.
	return renderCustomHeaderLines(theme, {
		assets: {
			...CUSTOM_HEADER_ASSETS,
			art: [{ art, ink }],
			caption: undefined,
			showHints: false,
			spacing: { aboveArt: 0, belowArt: 0, aboveHints: 0 },
		},
	})[0];
}

function main(): void {
	try {
		const { watchMode, theme, mask } = parseHeaderPreviewArgs(process.argv.slice(2));
		const prefix = watchMode ? CLEAR_SCREEN : "";
		process.stdout.write(`${prefix}${formatHeaderPreview({ theme, mask })}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
