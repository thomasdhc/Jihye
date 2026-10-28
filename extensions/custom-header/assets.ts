/**
 * Custom header template.
 *
 * This file is the editable half of the `custom-header` extension: artwork,
 * palette, caption, and hint data only. Rendering lives in `render.ts` and Pi
 * wiring lives in `index.ts`.
 *
 * Preview edits without restarting Pi:
 *
 *   npm run preview:header
 *   npm run preview:header:watch
 *
 * Then run `/reload` in Pi to pick the change up in a live session.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

/** One painted region: an optional Pi theme color plus optional bold. */
export interface HeaderPaint {
	/** Omit to keep the terminal's default foreground color. */
	readonly color?: ThemeColor;
	readonly bold?: boolean;
}

/**
 * One artwork line.
 *
 * `art` holds the glyphs and `ink` holds one palette key per glyph column.
 * The two strings must have the same number of characters, and every glyph
 * must be single-width so the columns stay aligned in an editor.
 * A space in `ink` leaves that column unpainted.
 */
export interface HeaderArtRow {
	readonly art: string;
	readonly ink: string;
}

/** One keybinding hint line, rendered through Pi's own hint formatters. */
export interface HeaderHint {
	/** `raw` for app shortcuts, `editor` for editor actions resolved by name. */
	readonly kind: "raw" | "editor";
	readonly key: string;
	readonly description: string;
}

export interface HeaderCaption {
	readonly text: string;
	readonly paint: HeaderPaint;
	readonly showVersion: boolean;
	readonly versionPaint: HeaderPaint;
}

export interface HeaderSpacing {
	readonly aboveArt: number;
	readonly belowArt: number;
	readonly aboveHints: number;
}

export interface CustomHeaderAssets {
	readonly art: readonly HeaderArtRow[];
	readonly palette: Readonly<Record<string, HeaderPaint>>;
	readonly caption?: HeaderCaption;
	readonly spacing: HeaderSpacing;
	readonly showHints: boolean;
	readonly hints: readonly HeaderHint[];
}

// ─── Editable region ────────────────────────────────────────────────────────
//
// Blank 17×9 canvas to copy when starting a new design. Keep `art` and `ink`
// the same length on every row, and keep every row the same length.
//
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//	{ art: "                 ", ink: "                 " },
//
// Useful glyphs: █ ▀ ▄ ▌ ▐ ▖ ▗ ▘ ▝ ▙ ▟ ▛ ▜ ░ ▒ ▓ ╱ ╲ ╳
//
// Ink keys used below:
//   f  green front face
//   e  accent-colored depth edge
//   b  bold terminal foreground
//   d  dim eye edge
//   ' ' unpainted background

/**
 * Keep the visible glyphs in `art` and their colors in the matching `ink`
 * string. Trailing spaces make every row a 17-column canvas.
 */
const PI_ART: readonly HeaderArtRow[] = [
	{ art: "     █▌  █▌      ", ink: "     bd  bd      " },
	{ art: "  ██████████████╗", ink: "  ffffffffffffffe" },
	{ art: "  ╚══██╔═══██╔══╝", ink: "  eeeffeeeeffeeee" },
	{ art: "     ██║   ██║   ", ink: "     ffe   ffe   " },
	{ art: "     ██║   ██║   ", ink: "     ffe   ffe   " },
	{ art: "     ██║   ██║   ", ink: "     ffe   ffe   " },
	{ art: "     ██║   ██║   ", ink: "     ffe   ffe   " },
	{ art: "   █████╗ █████╗ ", ink: "   fffffe fffffe " },
	{ art: "   ╚════╝ ╚════╝ ", ink: "   eeeeee eeeeee " },
];

export const CUSTOM_HEADER_ASSETS: CustomHeaderAssets = {
	art: PI_ART,
	palette: {
		f: { color: "success", bold: true },
		e: { color: "accent", bold: true },
		b: { bold: true },
		d: { color: "dim" },
	},
	caption: {
		text: "pi",
		paint: { color: "accent", bold: true },
		showVersion: true,
		versionPaint: { color: "dim" },
	},
	spacing: { aboveArt: 1, belowArt: 1, aboveHints: 1 },

	// Keybinding hints are off by default; set `showHints` to true to list them.
	showHints: false,
	hints: [
		{ kind: "raw", key: "escape", description: "to interrupt" },
		{ kind: "raw", key: "ctrl+c", description: "to clear" },
		{ kind: "raw", key: "ctrl+c twice", description: "to exit" },
		{ kind: "raw", key: "ctrl+d", description: "to exit (empty)" },
		{ kind: "raw", key: "ctrl+z", description: "to suspend" },
		{ kind: "editor", key: "deleteToLineEnd", description: "to delete to end" },
		{ kind: "raw", key: "shift+tab", description: "to cycle thinking level" },
		{ kind: "raw", key: "ctrl+p/shift+ctrl+p", description: "to cycle models" },
		{ kind: "raw", key: "ctrl+l", description: "to select model" },
		{ kind: "raw", key: "ctrl+o", description: "to expand tools" },
		{ kind: "raw", key: "ctrl+t", description: "to expand thinking" },
		{ kind: "raw", key: "ctrl+g", description: "for external editor" },
		{ kind: "raw", key: "/", description: "for commands" },
		{ kind: "raw", key: "!", description: "to run bash" },
		{ kind: "raw", key: "!!", description: "to run bash (no context)" },
		{ kind: "raw", key: "alt+enter", description: "to queue follow-up" },
		{ kind: "raw", key: "alt+up", description: "to edit all queued messages" },
		{ kind: "raw", key: process.platform === "win32" ? "alt+v" : "ctrl+v", description: "to paste image" },
		{ kind: "raw", key: "drop files", description: "to attach" },
	],
};

// ─── End of editable region ─────────────────────────────────────────────────

/** Display width of the artwork block, taken from its first row. */
export function getCustomHeaderArtWidth(assets: CustomHeaderAssets = CUSTOM_HEADER_ASSETS): number {
	return assets.art.length === 0 ? 0 : visibleWidth(assets.art[0].art);
}

/** Throw a message that points at the offending row when the template is malformed. */
export function validateCustomHeaderAssets(assets: CustomHeaderAssets = CUSTOM_HEADER_ASSETS): void {
	if (assets.art.length === 0) throw new Error("[custom-header] art must have at least one row");

	const width = getCustomHeaderArtWidth(assets);
	assets.art.forEach((row, index) => {
		const glyphs = [...row.art];
		const keys = [...row.ink];
		if (visibleWidth(row.art) !== width) {
			throw new Error(
				`[custom-header] art row ${index} has display width ${visibleWidth(row.art)}; expected ${width}: ${JSON.stringify(row.art)}`,
			);
		}
		if (glyphs.length !== width) {
			throw new Error(
				`[custom-header] art row ${index} mixes multi-width glyphs, so ink columns cannot align: ${JSON.stringify(row.art)}`,
			);
		}
		if (keys.length !== glyphs.length) {
			throw new Error(
				`[custom-header] art row ${index} has ${glyphs.length} glyphs but ${keys.length} ink columns`,
			);
		}
		keys.forEach((key, column) => {
			if (key !== " " && !assets.palette[key]) {
				throw new Error(
					`[custom-header] art row ${index} column ${column} uses ink key ${JSON.stringify(key)}, which is missing from the palette`,
				);
			}
		});
	});

	for (const [name, value] of Object.entries(assets.spacing)) {
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(`[custom-header] spacing.${name} must be a non-negative integer; received ${value}`);
		}
	}
}
