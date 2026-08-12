import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { analyzeSession } from "./analyzer.ts";
import { ObservationOverlay, OBSERVATION_OVERLAY_OPTIONS } from "./overlay.ts";
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
			const content = formatObservationReport(report);

			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) => new ObservationOverlay(tui, theme, content, () => done(undefined)),
				{
					overlay: true,
					overlayOptions: OBSERVATION_OVERLAY_OPTIONS,
				},
			);
		},
	});
}
