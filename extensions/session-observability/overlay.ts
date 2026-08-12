import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	type OverlayOptions,
	type TUI,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

export const OBSERVATION_OVERLAY_OPTIONS: OverlayOptions = {
	anchor: "center",
	width: 100,
	maxHeight: "85%",
	margin: 1,
};

export class ObservationOverlay {
	private scrollOffset = 0;
	private pageSize = 1;
	private maxScrollOffset = 0;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly content: string,
		private readonly done: () => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done();
			return;
		}
		if (matchesKey(data, Key.up)) {
			const next = Math.max(0, this.scrollOffset - 1);
			if (next !== this.scrollOffset) {
				this.scrollOffset = next;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.down)) {
			const next = Math.min(this.maxScrollOffset, this.scrollOffset + 1);
			if (next !== this.scrollOffset) {
				this.scrollOffset = next;
				this.tui.requestRender();
			}
		}
	}

	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		const contentWidth = Math.max(1, innerWidth - 2);
		const wrappedLines = this.content.split("\n").flatMap((line) => (
			line ? wrapTextWithAnsi(line, contentWidth) : [""]
		));
		const maxHeight = Math.max(4, Math.floor(this.tui.terminal.rows * 0.85));
		this.pageSize = Math.max(1, maxHeight - 3);
		this.maxScrollOffset = Math.max(0, wrappedLines.length - this.pageSize);
		this.scrollOffset = Math.min(this.scrollOffset, this.maxScrollOffset);

		const visible = wrappedLines.slice(this.scrollOffset, this.scrollOffset + this.pageSize);
		const border = (text: string) => this.theme.fg("borderAccent", text);
		const bodyLine = (text: string) => (
			border("│") + truncateToWidth(` ${text}`, innerWidth, "", true) + border("│")
		);
		const lines = [border(`╭${"─".repeat(innerWidth)}╮`)];
		for (const line of visible) lines.push(bodyLine(line));

		const end = Math.min(wrappedLines.length, this.scrollOffset + this.pageSize);
		const position = this.maxScrollOffset > 0
			? ` · ${this.scrollOffset + 1}-${end}/${wrappedLines.length}`
			: "";
		const help = this.theme.fg("dim", `↑↓ scroll · Esc close${position}`);
		lines.push(bodyLine(help));
		lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
		return lines;
	}

	invalidate(): void {}
}
