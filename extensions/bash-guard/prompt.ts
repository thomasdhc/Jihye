/**
 * Approval prompt for bash-guard.
 *
 * Renders the interactive run/abort dialog for a flagged command.
 */
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { Component, SelectItem, TUI } from "@earendil-works/pi-tui";
import { matchesKey, SelectList, Text, truncateToWidth } from "@earendil-works/pi-tui";

import type { Risk } from "./analysis.ts";

type PromptTheme = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

type PromptTui = Pick<TUI, "requestRender"> & { terminal?: { rows?: number } };

const OVERLAY_MARGIN = 1;
const FALLBACK_TERMINAL_ROWS = 24;
/** Share of the terminal the prompt may cover, so the session stays visible behind it. */
const MAX_HEIGHT_FRACTION = 0.6;
/** Rows the prompt may claim beyond that share, so small terminals stay readable. */
const MIN_PROMPT_ROWS = 8;
/** Lines scrolled per wheel notch, matching Pi's default viewport step. */
const WHEEL_SCROLL_LINES = 3;

/** Wheel direction from an SGR or X10 mouse report, or undefined for any other input. */
function readWheelDirection(data: string): -1 | 1 | undefined {
	const sgr = /^\x1b\[<(\d+);\d+;\d+[Mm]$/.exec(data);
	const button = sgr
		? Number.parseInt(sgr[1], 10)
		: data.length === 6 && data.startsWith("\x1b[M")
			? data.charCodeAt(3) - 32
			: undefined;
	if (button === undefined || (button & 64) === 0) return undefined;
	const direction = button & 3;
	if (direction === 0) return -1;
	if (direction === 1) return 1;
	return undefined;
}

export class BashGuardPromptComponent implements Component {
	private readonly actions: SelectList;
	private scrollOffset = 0;
	private pageSize = 1;
	private maxScrollOffset = 0;

	constructor(
		private readonly tui: PromptTui,
		private readonly theme: PromptTheme,
		private readonly command: string,
		private readonly risk: Risk,
		private readonly workingDirectory: string,
		done: (choice: "run" | "abort") => void,
	) {
		const items: SelectItem[] = [
			{ value: "run", label: "Run", description: "Execute the command" },
			{ value: "abort", label: "Abort", description: "Block this command" },
		];
		this.actions = new SelectList(items, items.length, {
			selectedPrefix: (text) => this.theme.fg("accent", text),
			selectedText: (text) => this.theme.fg("accent", text),
			description: (text) => this.theme.fg("muted", text),
			scrollInfo: (text) => this.theme.fg("dim", text),
			noMatch: (text) => this.theme.fg("warning", text),
		});
		this.actions.onSelect = (item) => done(item.value as "run" | "abort");
		this.actions.onCancel = () => done("abort");
	}

	private get terminalRows(): number {
		const rows = this.tui.terminal?.rows;
		return typeof rows === "number" && Number.isFinite(rows) && rows > 0
			? Math.floor(rows)
			: FALLBACK_TERMINAL_ROWS;
	}

	private get maxPromptRows(): number {
		const rows = this.terminalRows;
		const available = Math.max(1, rows - OVERLAY_MARGIN * 2);
		const bounded = Math.max(MIN_PROMPT_ROWS, Math.round(rows * MAX_HEIGHT_FRACTION));
		return Math.min(available, bounded);
	}

	private buildBody(): string {
		const flaggedLabel = this.risk.flaggedCommands.length === 1 ? "Problematic command" : "Problematic commands";
		const flaggedText = this.risk.flaggedCommands
			.map((flaggedCommand) => this.theme.fg("error", this.theme.bold(`⚠ ${flaggedCommand}`)))
			.join("\n");
		const reasonsText = this.risk.reasons.map((reason) => `• ${reason}`).join("\n");
		const fullCommandText = this.command
			.split("\n")
			.map((line) => this.theme.fg("muted", line))
			.join("\n");
		return [
			this.theme.fg("warning", `Command flagged as ${this.risk.severity.toUpperCase()} risk`),
			"",
			`${this.theme.bold("Working directory:")}\n${this.theme.fg("muted", this.workingDirectory)}`,
			"",
			`${this.theme.bold(`${flaggedLabel}:`)}\n${flaggedText}`,
			"",
			`${this.theme.bold("Reasons:")}\n${reasonsText}`,
			"",
			`${this.theme.bold("Full command:")}\n${fullCommandText}`,
		].join("\n");
	}

	private renderCompactActions(width: number): string[] {
		const selected = this.actions.getSelectedItem()?.value;
		const run = selected === "run" ? this.theme.fg("accent", "→ Run") : "  Run";
		const abort = selected === "abort" ? this.theme.fg("accent", "→ Abort") : "  Abort";
		return [truncateToWidth(`${run}  ${abort}`, width, "")];
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, Math.floor(width));
		const maxHeight = this.maxPromptRows;
		const fullActions = this.actions.render(safeWidth);
		const actions = maxHeight < fullActions.length ? this.renderCompactActions(safeWidth) : fullActions;
		let remainingHeight = maxHeight - actions.length;

		const border = new DynamicBorder((text: string) => this.theme.fg("warning", text)).render(safeWidth);
		const title = new Text(this.theme.fg("warning", this.theme.bold("Guarded bash command")), 1, 0).render(
			safeWidth,
		);
		const leading: string[] = [];
		let trailing: string[] = [];
		if (remainingHeight >= 2) {
			leading.push(...title);
			remainingHeight -= title.length;
		}
		if (remainingHeight >= 3) {
			leading.unshift(...border);
			remainingHeight -= border.length;
		}
		if (remainingHeight >= 3) {
			trailing = border;
			remainingHeight -= border.length;
		}

		const details = new Text(this.buildBody(), 1, 0).render(safeWidth);
		let detailsHeight = Math.max(0, remainingHeight);
		const overflow = details.length > detailsHeight;
		const showScrollStatus = overflow && detailsHeight >= 2;
		if (showScrollStatus) detailsHeight -= 1;

		this.pageSize = Math.max(1, detailsHeight);
		this.maxScrollOffset = Math.max(0, details.length - detailsHeight);
		this.scrollOffset = Math.min(this.scrollOffset, this.maxScrollOffset);
		const visibleDetails = details.slice(this.scrollOffset, this.scrollOffset + detailsHeight);
		const scrollStatus = showScrollStatus
			? [
					this.theme.fg(
						"dim",
						truncateToWidth(
							` Details ${this.scrollOffset + 1}-${this.scrollOffset + visibleDetails.length} of ${details.length} · PageUp/PageDown or wheel to scroll`,
							safeWidth,
							"",
						),
					),
			]
			: [];

		return [...leading, ...visibleDetails, ...scrollStatus, ...actions, ...trailing];
	}

	private scrollStep(data: string): number | undefined {
		const wheelDirection = readWheelDirection(data);
		if (wheelDirection !== undefined) return wheelDirection * WHEEL_SCROLL_LINES;
		const pageStep = Math.max(1, this.pageSize - 1);
		if (matchesKey(data, "pageUp")) return -pageStep;
		if (matchesKey(data, "pageDown")) return pageStep;
		return undefined;
	}

	handleInput(data: string): void {
		const step = this.scrollStep(data);
		if (step === undefined) {
			this.actions.handleInput(data);
			this.tui.requestRender();
			return;
		}
		const nextOffset = Math.min(this.maxScrollOffset, Math.max(0, this.scrollOffset + step));
		if (nextOffset !== this.scrollOffset) {
			this.scrollOffset = nextOffset;
			this.tui.requestRender();
		}
	}

	invalidate(): void {
		this.actions.invalidate();
	}
}

export async function promptRunOrAbort(ctx: any, command: string, risk: Risk): Promise<"run" | "abort"> {
	if (!ctx.hasUI) return "abort";

	const choice = await ctx.ui.custom<"run" | "abort">(
		(tui, theme, _keybindings, done) =>
			new BashGuardPromptComponent(
				tui,
				theme,
				command,
				risk,
				typeof ctx.cwd === "string" ? ctx.cwd : "(unknown)",
				done,
			),
		{
			overlay: true,
			overlayOptions: { width: "90%", maxHeight: "100%", margin: OVERLAY_MARGIN },
		},
	);

	return choice ?? "abort";
}
