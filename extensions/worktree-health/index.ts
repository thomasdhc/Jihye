/**
 * Worktree Health Extension
 *
 * Performs an offline, read-only audit of the current repository, canonical
 * checkouts under the workspace repository root, and repositories represented by
 * linked worktrees under the configured worktree root. Candidates are advisory;
 * it never fetches, prunes, removes, switches, or otherwise mutates Git state.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	createDefaultJihyeSetupConfig,
	loadJihyeSetupConfig,
} from "../jihye-setup/config.ts";
import {
	findWorkspaceDirectory,
	resolvePackagePaths,
} from "../jihye-setup/paths.ts";
import {
	formatWorktreeHealthReport,
	readConfiguredRepositoryRoot,
	readConfiguredWorktreeRoot,
	scanWorktreeHealth,
	type WorktreeHealthReport,
} from "./scanner.ts";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: /worktree-health [status]";

export interface WorktreeHealthExtensionDependencies {
	inspect?: (ctx: ExtensionContext) => Promise<WorktreeHealthReport>;
}

export function createWorktreeHealthExtension(dependencies: WorktreeHealthExtensionDependencies = {}) {
	return (pi: ExtensionAPI) => {
		let config = createDefaultJihyeSetupConfig();
		let configWarning: string | undefined;
		if (!dependencies.inspect) {
			try {
				config = loadJihyeSetupConfig();
			} catch (error) {
				configWarning = error instanceof Error ? error.message : String(error);
			}
		}

		const inspect = dependencies.inspect ?? (async (ctx: ExtensionContext): Promise<WorktreeHealthReport> => {
			const { personasDirectory } = resolvePackagePaths(EXTENSION_DIR);
			const workspaceDirectory = findWorkspaceDirectory({
				cwd: ctx.cwd,
				personasDirectory,
				workspaceRoots: config.workspaceRoots,
			});
			const configuredWorktrees = workspaceDirectory
				? readConfiguredWorktreeRoot(workspaceDirectory)
				: { warning: "No managed workspace root could be resolved" };
			const configuredRepositories = workspaceDirectory
				? readConfiguredRepositoryRoot(workspaceDirectory)
				: {};
			const warnings = [
				configWarning,
				configuredWorktrees.warning,
				configuredRepositories.warning,
			].filter((warning): warning is string => Boolean(warning));

			return scanWorktreeHealth({
				cwd: ctx.cwd,
				runner: (command, args, options) => pi.exec(command, args, options),
				workspaceDirectory,
				worktreeRoot: configuredWorktrees.path,
				repositoryCheckoutRoot: configuredRepositories.path,
				warnings,
			});
		});

		pi.on("session_start", (event, ctx) => {
			if (event.reason !== "startup" || !ctx.hasUI) return;
			void inspect(ctx)
				.then((report) => {
					const candidateCount = report.items.filter((item) => item.candidate).length;
					if (candidateCount > 0) {
						ctx.ui.notify(
							`Worktree health found ${candidateCount} cleanup candidate${candidateCount === 1 ? "" : "s"}. Run /worktree-health for details.`,
							"warning",
						);
					}
				})
				.catch(() => {
					// Startup health checks are advisory and must never block Pi.
				});
		});

		pi.registerCommand("worktree-health", {
			description: "Report workspace-registered and dangling worktree cleanup candidates",
			handler: async (args, ctx) => {
				const action = args.trim();
				if (action !== "" && action !== "status") {
					ctx.ui.notify(USAGE, "warning");
					return;
				}
				try {
					const report = await inspect(ctx);
					const hasCandidates = report.items.some((item) => item.candidate);
					ctx.ui.notify(formatWorktreeHealthReport(report), hasCandidates ? "warning" : "info");
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Worktree health check failed: ${message}`, "error");
				}
			},
		});
	};
}

export default createWorktreeHealthExtension();
