#!/usr/bin/env node

/** Interactive terminal grid editor for the custom header artwork. */

import { renameSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	CUSTOM_HEADER_ASSETS,
	type HeaderArtRow,
	type HeaderArtworkDocument,
	validateCustomHeaderAssets,
} from "../extensions/custom-header/assets.ts";
import { renderHeaderArtRow } from "../extensions/custom-header/render.ts";
import { loadPreviewTheme } from "./preview-header.ts";

const ARTWORK_PATH = fileURLToPath(new URL("../extensions/custom-header/artwork.json", import.meta.url));
const GLYPHS = ["█", "▀", "▄", "▌", "▐", "░", "▒", "▓", "╔", "╗", "╚", "╝", "═", "║", "╱", "╲", " "] as const;
const CLEAR_SCREEN = "\u001b[2J\u001b[H";
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const INVERSE = "\u001b[7m";
const RESET_INVERSE = "\u001b[27m";

export type HeaderEditorMode = "draw" | "paint";

interface HeaderEditorSnapshot {
	art: string[][];
	ink: string[][];
	row: number;
	column: number;
}

export interface HeaderEditorState extends HeaderEditorSnapshot {
	mode: HeaderEditorMode;
	selectedGlyph: string;
	selectedInk: string;
	dirty: boolean;
	savedSignature: string;
	status: string;
	confirmQuit: boolean;
	history: HeaderEditorSnapshot[];
	future: HeaderEditorSnapshot[];
}

export type HeaderEditorCommand =
	| { type: "move"; row: number; column: number }
	| { type: "toggle-mode" }
	| { type: "cycle-glyph"; offset: number }
	| { type: "input"; text: string }
	| { type: "stamp" }
	| { type: "erase"; backward?: boolean }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "save" }
	| { type: "quit" };

export interface HeaderEditorUpdate {
	state: HeaderEditorState;
	action?: "save" | "quit";
}

function copyGrid(grid: readonly (readonly string[])[]): string[][] {
	return grid.map((row) => [...row]);
}

function snapshot(state: HeaderEditorState): HeaderEditorSnapshot {
	return {
		art: copyGrid(state.art),
		ink: copyGrid(state.ink),
		row: state.row,
		column: state.column,
	};
}

function signature(art: readonly (readonly string[])[], ink: readonly (readonly string[])[]): string {
	return JSON.stringify([art, ink]);
}

function refreshDirty(state: HeaderEditorState): void {
	state.dirty = signature(state.art, state.ink) !== state.savedSignature;
}

function cloneState(state: HeaderEditorState): HeaderEditorState {
	return {
		...state,
		art: copyGrid(state.art),
		ink: copyGrid(state.ink),
		history: state.history.map((item) => ({ ...item, art: copyGrid(item.art), ink: copyGrid(item.ink) })),
		future: state.future.map((item) => ({ ...item, art: copyGrid(item.art), ink: copyGrid(item.ink) })),
	};
}

function paletteKeys(): string[] {
	return Object.keys(CUSTOM_HEADER_ASSETS.palette);
}

export function createHeaderEditorState(rows: readonly HeaderArtRow[]): HeaderEditorState {
	if (rows.length === 0) throw new Error("Header editor needs at least one artwork row");
	const art = rows.map((row) => [...row.art]);
	const ink = rows.map((row) => [...row.ink]);
	const savedSignature = signature(art, ink);
	return {
		art,
		ink,
		row: 0,
		column: 0,
		mode: "draw",
		selectedGlyph: GLYPHS[0],
		selectedInk: paletteKeys()[0] ?? " ",
		dirty: false,
		savedSignature,
		status: "Ready",
		confirmQuit: false,
		history: [],
		future: [],
	};
}

export function headerEditorRows(state: HeaderEditorState): HeaderArtRow[] {
	return state.art.map((row, index) => ({ art: row.join(""), ink: state.ink[index].join("") }));
}

function restore(state: HeaderEditorState, restored: HeaderEditorSnapshot): void {
	state.art = copyGrid(restored.art);
	state.ink = copyGrid(restored.ink);
	state.row = restored.row;
	state.column = restored.column;
	refreshDirty(state);
	state.confirmQuit = false;
}

function beginEdit(state: HeaderEditorState): void {
	state.history.push(snapshot(state));
	state.future = [];
	state.confirmQuit = false;
}

function moveCursor(state: HeaderEditorState, rowDelta: number, columnDelta: number): void {
	state.row = Math.max(0, Math.min(state.art.length - 1, state.row + rowDelta));
	state.column = Math.max(0, Math.min(state.art[state.row].length - 1, state.column + columnDelta));
	state.confirmQuit = false;
}

function advanceCursor(state: HeaderEditorState, offset: number): void {
	const width = state.art[0].length;
	const last = state.art.length * width - 1;
	const current = state.row * width + state.column;
	const next = Math.max(0, Math.min(last, current + offset));
	state.row = Math.floor(next / width);
	state.column = next % width;
}

function editCell(state: HeaderEditorState, glyph: string, ink: string): void {
	state.art[state.row][state.column] = glyph;
	state.ink[state.row][state.column] = ink;
	refreshDirty(state);
}

function applyText(state: HeaderEditorState, text: string): void {
	const characters = [...text];
	const invalid = characters.find((character) => visibleWidth(character) !== 1 || /[\u0000-\u001f\u007f]/u.test(character));
	if (invalid) {
		state.status = `Ignored non-single-width input ${JSON.stringify(invalid)}`;
		return;
	}

	beginEdit(state);
	for (const character of characters) {
		if (state.mode === "paint") {
			if (paletteKeys().includes(character)) {
				state.selectedInk = character;
				editCell(state, state.art[state.row][state.column], character);
			} else if (character === "x" || character === " ") {
				editCell(state, state.art[state.row][state.column], " ");
			} else {
				state.status = `Paint with ${paletteKeys().join("/")}; x clears color`;
				continue;
			}
		} else {
			editCell(state, character, character === " " ? " " : state.selectedInk);
		}
		advanceCursor(state, 1);
	}
	state.status = state.mode === "paint" ? `Paint: ${state.selectedInk}` : `Drew ${characters.length} cell${characters.length === 1 ? "" : "s"}`;
}

export function applyHeaderEditorCommand(current: HeaderEditorState, command: HeaderEditorCommand): HeaderEditorUpdate {
	const state = cloneState(current);

	switch (command.type) {
		case "move":
			moveCursor(state, command.row, command.column);
			break;
		case "toggle-mode":
			state.mode = state.mode === "draw" ? "paint" : "draw";
			state.status = `${state.mode === "draw" ? "Draw" : "Paint"} mode`;
			state.confirmQuit = false;
			break;
		case "cycle-glyph": {
			const currentIndex = Math.max(0, GLYPHS.indexOf(state.selectedGlyph as (typeof GLYPHS)[number]));
			const nextIndex = (currentIndex + command.offset + GLYPHS.length) % GLYPHS.length;
			state.selectedGlyph = GLYPHS[nextIndex];
			state.status = `Selected glyph ${state.selectedGlyph === " " ? "(space)" : state.selectedGlyph}`;
			state.confirmQuit = false;
			break;
		}
		case "input":
			applyText(state, command.text);
			break;
		case "stamp":
			beginEdit(state);
			if (state.mode === "draw") {
				editCell(state, state.selectedGlyph, state.selectedGlyph === " " ? " " : state.selectedInk);
			} else {
				editCell(state, state.art[state.row][state.column], state.selectedInk);
			}
			advanceCursor(state, 1);
			state.status = "Stamped cell";
			break;
		case "erase":
			if (command.backward) advanceCursor(state, -1);
			beginEdit(state);
			editCell(state, " ", " ");
			state.status = "Erased cell";
			break;
		case "undo": {
			const previous = state.history.pop();
			if (!previous) {
				state.status = "Nothing to undo";
				break;
			}
			state.future.push(snapshot(state));
			restore(state, previous);
			state.status = "Undid edit";
			break;
		}
		case "redo": {
			const next = state.future.pop();
			if (!next) {
				state.status = "Nothing to redo";
				break;
			}
			state.history.push(snapshot(state));
			restore(state, next);
			state.status = "Redid edit";
			break;
		}
		case "save":
			return { state, action: "save" };
		case "quit":
			if (!state.dirty || state.confirmQuit) return { state, action: "quit" };
			state.confirmQuit = true;
			state.status = "Unsaved changes — press Esc or Ctrl+Q again to discard them";
			break;
	}

	return { state };
}

export function markHeaderEditorSaved(current: HeaderEditorState): HeaderEditorState {
	const state = cloneState(current);
	state.savedSignature = signature(state.art, state.ink);
	state.dirty = false;
	state.confirmQuit = false;
	state.status = `Saved ${ARTWORK_PATH}`;
	return state;
}

export function serializeHeaderArtwork(rows: readonly HeaderArtRow[]): string {
	const document: HeaderArtworkDocument = { version: 1, rows };
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function saveHeaderArtwork(rows: readonly HeaderArtRow[], path = ARTWORK_PATH): void {
	const assets = { ...CUSTOM_HEADER_ASSETS, art: rows };
	validateCustomHeaderAssets(assets);
	const temporaryPath = `${path}.tmp-${process.pid}`;
	writeFileSync(temporaryPath, serializeHeaderArtwork(rows), "utf8");
	renameSync(temporaryPath, path);
}

export function decodeHeaderEditorInput(input: string): HeaderEditorCommand[] {
	const commands: HeaderEditorCommand[] = [];
	let text = "";
	const flush = () => {
		if (text) commands.push({ type: "input", text });
		text = "";
	};
	const sequences: Array<[string, HeaderEditorCommand]> = [
		["\u001b[A", { type: "move", row: -1, column: 0 }],
		["\u001b[B", { type: "move", row: 1, column: 0 }],
		["\u001b[C", { type: "move", row: 0, column: 1 }],
		["\u001b[D", { type: "move", row: 0, column: -1 }],
		["\u001b[3~", { type: "erase" }],
	];

	for (let index = 0; index < input.length; ) {
		const sequence = sequences.find(([candidate]) => input.startsWith(candidate, index));
		if (sequence) {
			flush();
			commands.push(sequence[1]);
			index += sequence[0].length;
			continue;
		}

		const codePoint = input.codePointAt(index);
		if (codePoint === undefined) break;
		const character = String.fromCodePoint(codePoint);
		index += character.length;
		const control: Record<string, HeaderEditorCommand> = {
			"\u0003": { type: "quit" },
			"\u0011": { type: "quit" },
			"\u0013": { type: "save" },
			"\u001a": { type: "undo" },
			"\u0019": { type: "redo" },
			"\u001b": { type: "quit" },
			"\u0009": { type: "toggle-mode" },
			"\r": { type: "stamp" },
			"\n": { type: "stamp" },
			"\u007f": { type: "erase", backward: true },
		};
		if (control[character]) {
			flush();
			commands.push(control[character]);
		} else if (character === "[") {
			flush();
			commands.push({ type: "cycle-glyph", offset: -1 });
		} else if (character === "]") {
			flush();
			commands.push({ type: "cycle-glyph", offset: 1 });
		} else {
			text += character;
		}
	}
	flush();
	return commands;
}

export function parseHeaderEditorArgs(args: readonly string[]): { theme: string } {
	let theme = "dark";
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--theme" || argument.startsWith("--theme=")) {
			const value = argument.startsWith("--theme=") ? argument.slice("--theme=".length) : args[++index];
			if (!value || value.startsWith("--")) throw new Error("Missing value for --theme");
			theme = value;
			continue;
		}
		throw new Error(`Unknown header editor option: ${argument}`);
	}
	return { theme };
}

function renderCell(theme: Theme, glyph: string, ink: string): string {
	return renderHeaderArtRow(theme, { art: glyph, ink }, CUSTOM_HEADER_ASSETS);
}

export function formatHeaderEditor(state: HeaderEditorState, theme: Theme): string {
	const width = state.art[0].length;
	const border = `  +${"-".repeat(width)}+`;
	const lines = [
		"Jihye custom-header grid editor",
		`Mode: ${state.mode.toUpperCase()}  Position: ${state.column + 1},${state.row + 1}  ${state.dirty ? "● unsaved" : "✓ saved"}`,
		"",
		`   ${[...Array(width).keys()].map((column) => column % 10).join("")}`,
		border,
	];

	state.art.forEach((row, rowIndex) => {
		let rendered = "";
		row.forEach((glyph, columnIndex) => {
			const cell = renderCell(theme, glyph, state.ink[rowIndex][columnIndex]);
			rendered += rowIndex === state.row && columnIndex === state.column ? `${INVERSE}${cell}${RESET_INVERSE}` : cell;
		});
		lines.push(`${String(rowIndex + 1).padStart(2)}|${rendered}|`);
	});
	lines.push(border, "");

	if (state.mode === "draw") {
		const glyphs = GLYPHS.map((glyph) => glyph === state.selectedGlyph ? `${INVERSE}${glyph}${RESET_INVERSE}` : glyph).join(" ");
		lines.push(`Glyphs: ${glyphs}`, `Ink applied while drawing: ${state.selectedInk}`);
	} else {
		lines.push(`Palette: ${paletteKeys().map((key) => key === state.selectedInk ? `${INVERSE}${key}${RESET_INVERSE}` : key).join(" ")}  x clear`);
	}

	lines.push(
		"",
		"Arrows move · type/paste draws · [ ] choose glyph · Enter stamps · Space/Delete erases",
		"Tab toggles draw/paint · Ctrl+Z/Y undo/redo · Ctrl+S save · Esc/Ctrl+Q quit",
		"",
		state.status,
	);
	return lines.join("\n");
}

function runEditor(themeName: string): void {
	if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
		throw new Error("The header grid editor requires an interactive terminal");
	}
	const theme = loadPreviewTheme(themeName);
	let state = createHeaderEditorState(CUSTOM_HEADER_ASSETS.art);
	let closed = false;

	const render = () => process.stdout.write(`${CLEAR_SCREEN}${HIDE_CURSOR}${formatHeaderEditor(state, theme)}`);
	const cleanup = () => {
		if (closed) return;
		closed = true;
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write(`${SHOW_CURSOR}\n`);
	};
	const close = () => {
		cleanup();
		process.off("SIGINT", close);
		process.off("SIGTERM", close);
		process.stdout.off("resize", render);
	};

	process.stdin.setEncoding("utf8");
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.on("SIGINT", close);
	process.on("SIGTERM", close);
	process.stdout.on("resize", render);
	process.stdin.on("data", (data: string) => {
		try {
			for (const command of decodeHeaderEditorInput(data)) {
				const update = applyHeaderEditorCommand(state, command);
				state = update.state;
				if (update.action === "save") {
					saveHeaderArtwork(headerEditorRows(state));
					state = markHeaderEditorSaved(state);
				}
				if (update.action === "quit") {
					close();
					return;
				}
			}
			render();
		} catch (error) {
			state.status = error instanceof Error ? error.message : String(error);
			render();
		}
	});
	render();
}

function main(): void {
	try {
		runEditor(parseHeaderEditorArgs(process.argv.slice(2)).theme);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
