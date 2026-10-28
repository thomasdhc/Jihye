import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CUSTOM_HEADER_ASSETS, parseHeaderArtworkDocument } from "../extensions/custom-header/assets.ts";
import {
	applyHeaderEditorCommand,
	createHeaderEditorState,
	decodeHeaderEditorInput,
	formatHeaderEditor,
	headerEditorRows,
	markHeaderEditorSaved,
	parseHeaderEditorArgs,
	saveHeaderArtwork,
	serializeHeaderArtwork,
} from "../scripts/edit-header.ts";
import { loadPreviewTheme } from "../scripts/preview-header.ts";

test("draws, paints, erases, and moves through the header grid", () => {
	let state = createHeaderEditorState(CUSTOM_HEADER_ASSETS.art);
	state = applyHeaderEditorCommand(state, { type: "input", text: "A" }).state;
	assert.equal(state.art[0][0], "A");
	assert.equal(state.ink[0][0], "f");
	assert.equal(state.column, 1);
	assert.equal(state.dirty, true);

	state = applyHeaderEditorCommand(state, { type: "move", row: 0, column: -1 }).state;
	state = applyHeaderEditorCommand(state, { type: "toggle-mode" }).state;
	state = applyHeaderEditorCommand(state, { type: "input", text: "e" }).state;
	assert.equal(state.art[0][0], "A");
	assert.equal(state.ink[0][0], "e");

	state = applyHeaderEditorCommand(state, { type: "erase", backward: true }).state;
	assert.equal(state.art[0][0], " ");
	assert.equal(state.ink[0][0], " ");
});

test("supports selected glyph stamping plus undo and redo", () => {
	let state = createHeaderEditorState(CUSTOM_HEADER_ASSETS.art);
	state = applyHeaderEditorCommand(state, { type: "cycle-glyph", offset: 1 }).state;
	assert.equal(state.selectedGlyph, "▀");
	state = applyHeaderEditorCommand(state, { type: "stamp" }).state;
	assert.equal(state.art[0][0], "▀");

	state = applyHeaderEditorCommand(state, { type: "undo" }).state;
	assert.equal(state.art[0][0], CUSTOM_HEADER_ASSETS.art[0].art[0]);
	state = applyHeaderEditorCommand(state, { type: "redo" }).state;
	assert.equal(state.art[0][0], "▀");
});

test("requires confirmation before discarding unsaved editor changes", () => {
	let state = createHeaderEditorState(CUSTOM_HEADER_ASSETS.art);
	state = applyHeaderEditorCommand(state, { type: "input", text: "A" }).state;
	const firstQuit = applyHeaderEditorCommand(state, { type: "quit" });
	assert.equal(firstQuit.action, undefined);
	assert.equal(firstQuit.state.confirmQuit, true);
	assert.equal(applyHeaderEditorCommand(firstQuit.state, { type: "quit" }).action, "quit");

	const save = applyHeaderEditorCommand(state, { type: "save" });
	assert.equal(save.action, "save");
	assert.equal(markHeaderEditorSaved(save.state).dirty, false);
});

test("decodes terminal controls and groups pasted glyphs", () => {
	assert.deepEqual(decodeHeaderEditorInput("\u001b[Aab\t\u0013"), [
		{ type: "move", row: -1, column: 0 },
		{ type: "input", text: "ab" },
		{ type: "toggle-mode" },
		{ type: "save" },
	]);
	assert.deepEqual(decodeHeaderEditorInput("[]\u007f\u001b[3~"), [
		{ type: "cycle-glyph", offset: -1 },
		{ type: "cycle-glyph", offset: 1 },
		{ type: "erase", backward: true },
		{ type: "erase" },
	]);
});

test("serializes and atomically saves a valid artwork document", () => {
	const rows = headerEditorRows(createHeaderEditorState(CUSTOM_HEADER_ASSETS.art));
	const serialized = serializeHeaderArtwork(rows);
	assert.deepEqual(parseHeaderArtworkDocument(JSON.parse(serialized)).rows, rows);

	const directory = mkdtempSync(join(tmpdir(), "jihye-header-editor-"));
	try {
		const path = join(directory, "artwork.json");
		saveHeaderArtwork(rows, path);
		assert.deepEqual(parseHeaderArtworkDocument(JSON.parse(readFileSync(path, "utf8"))).rows, rows);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("renders editor controls and parses theme options", () => {
	const state = createHeaderEditorState(CUSTOM_HEADER_ASSETS.art);
	const output = formatHeaderEditor(state, loadPreviewTheme("dark"));
	assert.match(output, /grid editor/);
	assert.match(output, /Ctrl\+S save/);
	assert.match(output, /DRAW/);
	assert.deepEqual(parseHeaderEditorArgs([]), { theme: "dark" });
	assert.deepEqual(parseHeaderEditorArgs(["--theme", "light"]), { theme: "light" });
	assert.throws(() => parseHeaderEditorArgs(["--theme"]), /Missing value/);
});
