/**
 * Project Info Extension
 *
 * Shows the current project name and git branch as a persistent footer status.
 * Example: "lada @ feature/steer-depth-mode"
 *
 * Updates on session start and before each agent turn (catches mid-session branch switches).
 */

import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	async function updateStatus(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		let repoRoot = "";
		let branch = "";
		try {
			const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
				cwd: ctx.cwd,
				timeout: 3000,
			});
			repoRoot = rootResult.stdout.trim();

			const branchResult = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
				timeout: 3000,
			});
			branch = branchResult.stdout.trim();
		} catch {
			// Not a git repo — clear status and bail
			ctx.ui.setStatus("project-info", "");
			return;
		}

		const project = path.basename(repoRoot);
		const theme = ctx.ui.theme;
		const projectText = theme.fg("accent", project);
		const branchText = branch ? theme.fg("dim", ` @ ${branch}`) : "";
		ctx.ui.setStatus("project-info", projectText + branchText);
	}

	pi.on("session_start", async (_event, ctx) => {
		await updateStatus(ctx);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		await updateStatus(ctx);
	});
}
