/**
 * Custom Header Extension
 *
 * Replaces Pi's built-in startup header with the artwork in `assets.ts`.
 *
 * Edit `assets.ts`, preview with `npm run preview:header`, then run `/reload`.
 * Use `/builtin-header` to restore the built-in header for the current session,
 * or delete this directory to restore it permanently.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

import { renderCustomHeaderLines } from "./render.ts";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		try {
			// Render once up front so a malformed template surfaces as a warning
			// instead of breaking every later header redraw.
			renderCustomHeaderLines({ fg: (_color, text) => text, bold: (text) => text });
		} catch (error) {
			ctx.ui.notify(
				`Custom header disabled: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
			return;
		}

		ctx.ui.setHeader((_tui, theme: Theme) => ({
			render(_width: number): string[] {
				return renderCustomHeaderLines(theme);
			},
			invalidate() {},
		}));
	});

	pi.registerCommand("builtin-header", {
		description: "Restore the built-in startup header",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
