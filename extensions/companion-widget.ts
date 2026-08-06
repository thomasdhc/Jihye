import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import {
	COMPANION_WIDGET_UPDATE_EVENT,
	type CompanionWidgetContribution,
	type CompanionWidgetTone,
	type CompanionWidgetUpdate,
} from "../lib/companion-widget.ts";

const WIDGET_ID = "companion-widget";
const COLUMN_GAP = 2;

export function renderCompanionWidgetLines(
	contributions: Iterable<CompanionWidgetContribution>,
	style: (tone: CompanionWidgetTone, text: string) => string = (_tone, text) => text,
): string[] {
	const active = [...contributions].filter((item) => item.lines.length > 0).sort((a, b) => a.order - b.order);
	const visual = active.filter((item) => item.region === "visual");
	const details = active.filter((item) => item.region === "details");
	const visualHeight = Math.max(0, ...visual.map((item) => item.lines.length));
	const visualLines = Array.from({ length: visualHeight }, (_, row) => {
		const segments = visual.map((item) => {
			const text = item.lines[row] ?? "";
			return style(item.tone ?? "muted", text);
		});
		return segments.join(" ".repeat(COLUMN_GAP)).trimEnd();
	});
	const visualWidth = Math.max(0, ...visualLines.map(visibleWidth));
	const detailLines = details.flatMap((item) =>
		item.lines.map((line) => style(item.tone ?? "muted", line)),
	);
	const height = Math.max(visualLines.length, detailLines.length);

	return Array.from({ length: height }, (_, row) => {
		const left = visualLines[row] ?? "";
		const right = detailLines[row] ?? "";
		if (!right) return left;
		if (!left && visualWidth === 0) return right;
		return `${left}${" ".repeat(visualWidth - visibleWidth(left) + COLUMN_GAP)}${right}`;
	});
}

export default function companionWidgetExtension(pi: ExtensionAPI): void {
	const contributions = new Map<string, CompanionWidgetContribution>();
	let requestRender: (() => void) | undefined;

	pi.events.on(COMPANION_WIDGET_UPDATE_EVENT, (update: CompanionWidgetUpdate) => {
		if (update.contribution) contributions.set(update.id, update.contribution);
		else contributions.delete(update.id);
		requestRender?.();
	});

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWidget(
			WIDGET_ID,
			(tui, theme) => {
				requestRender = () => tui.requestRender();
				return {
					render(width: number) {
						return renderCompanionWidgetLines(contributions.values(), (tone, text) => theme.fg(tone, text)).map(
							(line) => truncateToWidth(line, width),
						);
					},
					invalidate() {},
					dispose() {
						requestRender = undefined;
					},
				};
			},
			{ placement: "belowEditor" },
		);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		requestRender = undefined;
		contributions.clear();
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_ID, undefined);
	});
}
