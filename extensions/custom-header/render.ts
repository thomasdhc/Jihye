/**
 * Custom header rendering.
 *
 * Turns the `assets.ts` template into theme-colored terminal lines. Shared by
 * the Pi extension and the `npm run preview:header` script so both show the
 * same output.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { VERSION, keyHint, rawKeyHint } from "@earendil-works/pi-coding-agent";

import {
	CUSTOM_HEADER_ASSETS,
	type CustomHeaderAssets,
	type HeaderArtRow,
	type HeaderHint,
	type HeaderPaint,
	validateCustomHeaderAssets,
} from "./assets.ts";

/** The slice of Pi's `Theme` the header needs. */
export interface HeaderTheme {
	fg(color: ThemeColor, text: string): string;
	bold(text: string): string;
}

function paint(theme: HeaderTheme, style: HeaderPaint, text: string): string {
	const colored = theme.fg(style.color, text);
	return style.bold ? theme.bold(colored) : colored;
}

/** Paint one artwork row by grouping neighboring columns that share an ink key. */
export function renderHeaderArtRow(theme: HeaderTheme, row: HeaderArtRow, assets: CustomHeaderAssets): string {
	const glyphs = [...row.art];
	const keys = [...row.ink];
	let rendered = "";
	let index = 0;

	while (index < glyphs.length) {
		const key = keys[index] ?? " ";
		let end = index + 1;
		while (end < glyphs.length && (keys[end] ?? " ") === key) end += 1;

		const segment = glyphs.slice(index, end).join("");
		const style = assets.palette[key];
		rendered += style ? paint(theme, style, segment) : segment;
		index = end;
	}

	return rendered;
}

function renderHint(hint: HeaderHint): string {
	return hint.kind === "editor" ? keyHint(hint.key, hint.description) : rawKeyHint(hint.key, hint.description);
}

export interface RenderCustomHeaderOptions {
	readonly assets?: CustomHeaderAssets;
	/** Version shown after the caption; defaults to the running Pi version. */
	readonly version?: string;
}

/** Render the full header, validating the template first. */
export function renderCustomHeaderLines(theme: HeaderTheme, options: RenderCustomHeaderOptions = {}): string[] {
	const assets = options.assets ?? CUSTOM_HEADER_ASSETS;
	validateCustomHeaderAssets(assets);

	const lines: string[] = [];
	const blanks = (count: number) => lines.push(...Array<string>(count).fill(""));

	blanks(assets.spacing.aboveArt);
	lines.push(...assets.art.map((row) => renderHeaderArtRow(theme, row, assets)));

	if (assets.caption) {
		blanks(assets.spacing.belowArt);
		const version = options.version ?? VERSION;
		const caption = paint(theme, assets.caption.paint, assets.caption.text);
		lines.push(
			assets.caption.showVersion
				? caption + paint(theme, assets.caption.versionPaint, ` v${version}`)
				: caption,
		);
	}

	if (assets.showHints && assets.hints.length > 0) {
		blanks(assets.spacing.aboveHints);
		lines.push(...assets.hints.map(renderHint));
	}

	return lines;
}
