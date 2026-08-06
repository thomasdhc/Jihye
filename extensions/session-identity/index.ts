import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
} from "../../lib/companion-widget.ts";
import {
	getActiveSessionIdentity,
	setActiveSessionIdentity,
} from "../../lib/session-identity.ts";
import {
	SessionNameAllocator,
	type SessionNameLease,
} from "./allocator.ts";
import { createSessionIdentityConfig } from "./config.ts";

const COMPANION_CONTRIBUTION_ID = "session-identity";

interface SessionLeaseAllocator {
	acquire(): Promise<SessionNameLease>;
	release(lease: SessionNameLease): Promise<boolean>;
}

interface SessionIdentityExtensionOptions {
	allocator?: SessionLeaseAllocator;
	formatTitle?: (name: string, cwd: string) => string;
}

export function formatSessionIdentityTitle(name: string, cwd: string): string {
	return `π - ${name} - ${basename(cwd) || cwd}`;
}

export function createSessionIdentityExtension(
	options: SessionIdentityExtensionOptions = {},
) {
	return function sessionIdentityExtension(pi: ExtensionAPI): void {
		const allocator = options.allocator ?? new SessionNameAllocator(createSessionIdentityConfig());
		const formatTitle = options.formatTitle ?? formatSessionIdentityTitle;
		let lease: SessionNameLease | undefined;
		let restoringName = false;

		function synchronizeIdentity(ctx: ExtensionContext): void {
			if (!lease) return;
			setActiveSessionIdentity(lease.name);
			updateCompanionWidget(pi.events, {
				id: COMPANION_CONTRIBUTION_ID,
				region: "details",
				order: 30,
				lines: [lease.name],
				tone: "accent",
			});
			if (ctx.hasUI) ctx.ui.setTitle(formatTitle(lease.name, ctx.cwd));
		}

		function enforceSessionName(ctx: ExtensionContext): void {
			if (!lease || pi.getSessionName() === lease.name || restoringName) {
				synchronizeIdentity(ctx);
				return;
			}

			restoringName = true;
			try {
				pi.setSessionName(lease.name);
			} finally {
				restoringName = false;
			}
			synchronizeIdentity(ctx);
		}

		pi.on("session_start", async (_event, ctx) => {
			try {
				lease = await allocator.acquire();
				enforceSessionName(ctx);
			} catch (error) {
				removeCompanionWidgetContribution(pi.events, COMPANION_CONTRIBUTION_ID);
				if (!ctx.hasUI) return;
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Session identity unavailable: ${message}`, "warning");
			}
		});

		pi.on("session_info_changed", async (event, ctx) => {
			if (!lease) return;
			if (event.name !== lease.name && !restoringName) {
				restoringName = true;
				try {
					pi.setSessionName(lease.name);
				} finally {
					restoringName = false;
				}
			}
			synchronizeIdentity(ctx);
		});

		pi.on("session_shutdown", async (event, ctx) => {
			if (event.reason !== "quit" || !lease) return;
			const releasedLease = lease;
			lease = undefined;
			try {
				await allocator.release(releasedLease);
			} catch (error) {
				if (ctx.hasUI) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Could not release session identity: ${message}`, "warning");
				}
			} finally {
				removeCompanionWidgetContribution(pi.events, COMPANION_CONTRIBUTION_ID);
				if (getActiveSessionIdentity() === releasedLease.name) {
					setActiveSessionIdentity(undefined);
				}
			}
		});
	};
}

export default createSessionIdentityExtension();
