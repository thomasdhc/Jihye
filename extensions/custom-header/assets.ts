/**
 * Custom header template.
 *
 * Artwork rows load from `artwork.json`; this file owns their palette, caption,
 * hints, validation, and document parsing. Rendering lives in `render.ts` and
 * Pi wiring lives in `index.ts`.
 *
 * Draw and preview edits without restarting Pi:
 *
 *   npm run edit:header
 *   npm run preview:header
 *
 * When artwork changes, update both `extensions/custom-header/artwork.json`
 * and `docs/assets/jihye-header.svg` (the README header), keeping glyphs and ink aligned.
 * Then run `/reload` in Pi to pick the change up in a live session.
 */

import { readFileSync } from "node:fs";

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

export interface HeaderArtworkDocument {
	readonly version: 1;
	readonly rows: readonly HeaderArtRow[];
}

/** Parse the grid editor's portable artwork document. */
export function parseHeaderArtworkDocument(value: unknown): HeaderArtworkDocument {
	if (!value || typeof value !== "object") throw new Error("[custom-header] artwork must be an object");
	const document = value as { version?: unknown; rows?: unknown };
	if (document.version !== 1) throw new Error("[custom-header] artwork version must be 1");
	if (!Array.isArray(document.rows)) throw new Error("[custom-header] artwork rows must be an array");

	const rows = document.rows.map((row, index) => {
		if (!row || typeof row !== "object") throw new Error(`[custom-header] artwork row ${index} must be an object`);
		const candidate = row as { art?: unknown; ink?: unknown };
		if (typeof candidate.art !== "string" || typeof candidate.ink !== "string") {
			throw new Error(`[custom-header] artwork row ${index} must contain art and ink strings`);
		}
		return { art: candidate.art, ink: candidate.ink };
	});

	return { version: 1, rows };
}

const ARTWORK_URL = new URL("./artwork.json", import.meta.url);
const ARTWORK = parseHeaderArtworkDocument(JSON.parse(readFileSync(ARTWORK_URL, "utf8")));

export const CUSTOM_HEADER_ASSETS: CustomHeaderAssets = {
	art: ARTWORK.rows,
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
