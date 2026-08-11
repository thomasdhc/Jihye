/**
 * Approval prompt for bash-guard.
 *
 * Renders the interactive run/abort dialog for a flagged command.
 */
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";

import type { Risk } from "./analysis.ts";

export async function promptRunOrAbort(ctx: any, command: string, risk: Risk): Promise<"run" | "abort"> {
	if (!ctx.hasUI) return "abort";

	const items: SelectItem[] = [
		{ value: "run", label: "Run", description: "Execute the command" },
		{ value: "abort", label: "Abort", description: "Block this command" },
	];

	const choice = await ctx.ui.custom<"run" | "abort">((tui, theme, _kb, done) => {
		const reasonsText = risk.reasons.map((reason) => `• ${reason}`).join("\n");
		const flaggedLabel = risk.flaggedCommands.length === 1 ? "Problematic command" : "Problematic commands";
		const flaggedText = risk.flaggedCommands
			.map((flaggedCommand) => theme.fg("error", theme.bold(`⚠ ${flaggedCommand}`)))
			.join("\n");
		const fullCommandText = command
			.split("\n")
			.map((line) => theme.fg("muted", line))
			.join("\n");
		const workingDirectory = typeof ctx.cwd === "string" ? ctx.cwd : "(unknown)";
		const body = [
			theme.fg("warning", `Command flagged as ${risk.severity.toUpperCase()} risk`),
			"",
			`${theme.bold("Working directory:")}\n${theme.fg("muted", workingDirectory)}`,
			"",
			`${theme.bold(`${flaggedLabel}:`)}\n${flaggedText}`,
			"",
			`${theme.bold("Reasons:")}\n${reasonsText}`,
			"",
			`${theme.bold("Full command:")}\n${fullCommandText}`,
		].join("\n");

		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));
		container.addChild(new Text(theme.fg("warning", theme.bold("Guarded bash command")), 1, 0));
		container.addChild(new Text(body, 1, 0));

		const list = new SelectList(items, items.length, {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		});

		list.onSelect = (item) => done(item.value as "run" | "abort");
		list.onCancel = () => done("abort");
		container.addChild(list);

		container.addChild(new DynamicBorder((s: string) => theme.fg("warning", s)));

		return {
			render: (w) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data) => {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	}, { overlay: true });

	return choice ?? "abort";
}
