import assert from "node:assert/strict";
import test from "node:test";

import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	CUSTOM_HEADER_ASSETS,
	type CustomHeaderAssets,
	getCustomHeaderArtWidth,
	validateCustomHeaderAssets,
} from "../extensions/custom-header/assets.ts";
import { renderCustomHeaderLines } from "../extensions/custom-header/render.ts";
import { formatHeaderPreview, loadPreviewTheme, parseHeaderPreviewArgs } from "../scripts/preview-header.ts";

const stubTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => `*${text}*`,
} as Parameters<typeof renderCustomHeaderLines>[0];

function withAssets(overrides: Partial<CustomHeaderAssets>): CustomHeaderAssets {
	return { ...CUSTOM_HEADER_ASSETS, ...overrides };
}

test("bundled template is a rectangle of single-width glyphs with painted ink columns", () => {
	validateCustomHeaderAssets();

	const width = getCustomHeaderArtWidth();
	assert.ok(width > 0);
	for (const row of CUSTOM_HEADER_ASSETS.art) {
		assert.equal(visibleWidth(row.art), width);
		assert.equal([...row.art].length, width);
		assert.equal([...row.ink].length, width);
	}
});

test("preserves the existing custom header artwork", () => {
	const plainTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as Parameters<typeof renderCustomHeaderLines>[0];
	const lines = renderCustomHeaderLines(plainTheme, { version: "9.9.9" });

	assert.deepEqual(lines.slice(1, 10).map((line) => line.trimEnd()), [
		"     █▌  █▌",
		"  ██████████████╗",
		"  ╚══██╔═══██╔══╝",
		"     ██║   ██║",
		"     ██║   ██║",
		"     ██║   ██║",
		"     ██║   ██║",
		"   █████╗ █████╗",
		"   ╚════╝ ╚════╝",
	]);
});

test("renders spacing, artwork, and the versioned caption", () => {
	const lines = renderCustomHeaderLines(stubTheme, { version: "9.9.9" });
	const { spacing, art, caption } = CUSTOM_HEADER_ASSETS;

	assert.equal(lines.length, spacing.aboveArt + art.length + spacing.belowArt + 1);
	assert.deepEqual(lines.slice(0, spacing.aboveArt), Array(spacing.aboveArt).fill(""));
	assert.equal(lines.at(-1), `*<accent>${caption?.text}</accent>*<dim> v9.9.9</dim>`);
});

test("paints neighboring columns that share an ink key as one segment", () => {
	const assets = withAssets({
		art: [{ art: "ab cd", ink: "ll bp" }],
		palette: {
			l: { color: "success", bold: true },
			b: { bold: true },
			p: { color: "accent" },
		},
		caption: undefined,
		spacing: { aboveArt: 0, belowArt: 0, aboveHints: 0 },
	});

	assert.deepEqual(renderCustomHeaderLines(stubTheme, { assets }), [
		"*<success>ab</success>* *c*<accent>d</accent>",
	]);
});

test("renders keybinding hints only when the template enables them", () => {
	initTheme("dark", false);
	const hints = [{ kind: "raw", key: "ctrl+c", description: "to clear" }] as const;

	const off = renderCustomHeaderLines(stubTheme, { assets: withAssets({ showHints: false, hints }) });
	const on = renderCustomHeaderLines(stubTheme, { assets: withAssets({ showHints: true, hints }) });

	assert.ok(!off.some((line) => line.includes("to clear")));
	assert.ok(on.at(-1)?.includes("to clear"));
});

test("rejects templates that would misalign or fail to paint", () => {
	const cases: Array<[string, Partial<CustomHeaderAssets>]> = [
		["at least one row", { art: [] }],
		["ink columns", { art: [{ art: "abc", ink: "ff" }] }],
		["missing from the palette", { art: [{ art: "abc", ink: "ffz" }] }],
		["display width", { art: [{ art: "abc", ink: "fff" }, { art: "ab", ink: "ff" }] }],
		["multi-width glyphs", { art: [{ art: "字b", ink: "ff" }] }],
		["spacing.aboveArt", { spacing: { aboveArt: -1, belowArt: 0, aboveHints: 0 } }],
	];

	for (const [expected, overrides] of cases) {
		assert.throws(() => validateCustomHeaderAssets(withAssets(overrides)), new RegExp(expected), expected);
	}
});

test("parses preview options and defaults to the bundled dark theme", () => {
	assert.deepEqual(parseHeaderPreviewArgs([]), { watchMode: false, theme: "dark", mask: false });
	assert.deepEqual(parseHeaderPreviewArgs(["--mask", "--theme", "light", "--watch-mode"]), {
		watchMode: true,
		theme: "light",
		mask: true,
	});
	assert.throws(() => parseHeaderPreviewArgs(["--theme"]), /Missing value for --theme/);
	assert.throws(() => parseHeaderPreviewArgs(["--sprite"]), /Unknown header preview option/);
	assert.throws(() => loadPreviewTheme("nope"), /Theme not found/);
});

test("previews the artwork inside aligned boundaries, with the ink mask on request", () => {
	const width = getCustomHeaderArtWidth();
	const border = `+${"-".repeat(width)}+`;

	const plain = formatHeaderPreview();
	const plainRows = plain.split("\n").filter((line) => line.startsWith("|"));
	assert.equal(plainRows.length, CUSTOM_HEADER_ASSETS.art.length);
	assert.ok(plain.includes(border));
	assert.ok(plainRows.every((row) => visibleWidth(row) === width + 2));
	assert.ok(!plain.includes(CUSTOM_HEADER_ASSETS.art[0].ink));

	const masked = formatHeaderPreview({ mask: true, theme: "light" });
	assert.ok(masked.includes("theme: light"));
	assert.ok(masked.includes(`|${CUSTOM_HEADER_ASSETS.art[0].ink}|`));
	assert.equal(new Set(masked.split("\n").filter((line) => line.startsWith("|")).map(visibleWidth)).size, 1);
});
