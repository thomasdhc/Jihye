import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, Text } from "@earendil-works/pi-tui";

import { analyzeSession } from "./analyzer.ts";
import { formatObservationReport } from "./render.ts";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("jihye-observe", {
		description: "Inspect model, tool, and subagent activity on the active session branch",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /jihye-observe", "warning");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/jihye-observe requires interactive mode", "error");
				return;
			}

			await ctx.waitForIdle();
			const report = analyzeSession(ctx.sessionManager.getBranch(), {
				sessionId: ctx.sessionManager.getSessionId(),
				sessionName: ctx.sessionManager.getSessionName(),
			});
			const content = `${formatObservationReport(report)}\n\nPress Esc or Ctrl+C to close.`;

			await ctx.ui.custom<void>((_tui, _theme, _keybindings, done) => {
				const text = new Text(content, 1, 1);
				return {
					render: (width) => text.render(width),
					invalidate: () => text.invalidate(),
					handleInput: (data) => {
						if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(undefined);
					},
				};
			});
		},
	});
}
