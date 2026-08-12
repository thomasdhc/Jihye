import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	removeCompanionWidgetContribution,
	updateCompanionWidget,
} from "../api.ts";
import {
	consumeLegacySessionDisplayName,
	getActiveSessionIdentity,
	setActiveSessionIdentity,
} from "./state.ts";
import {
	SessionNameAllocator,
	type SessionNameLease,
} from "./allocator.ts";
import {
	createSessionIdentityConfig,
	type SessionIdentityConfig,
} from "./config.ts";

const COMPANION_CONTRIBUTION_ID = "session-identity";

interface SessionLeaseAllocator {
	acquire(): Promise<SessionNameLease>;
	release(lease: SessionNameLease): Promise<boolean>;
}

interface SessionIdentityExtensionOptions {
	allocator?: SessionLeaseAllocator;
	createConfig?: () => SessionIdentityConfig;
	formatSessionName?: (identity: string, createdAt: string) => string;
	formatTitle?: (name: string, cwd: string) => string;
	reportWarning?: (message: string) => void;
	shouldReleaseOnReload?: () => boolean;
}

export function formatSessionIdentityTitle(name: string, cwd: string): string {
	return `π - ${name} - ${basename(cwd) || cwd}`;
}

export function formatAutomaticSessionName(identity: string, createdAt: string): string {
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid session creation timestamp: ${createdAt}`);
	}
	const pad = (value: number) => String(value).padStart(2, "0");
	const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	return `${identity} · ${day} ${time}`;
}

export function createSessionIdentityExtension(
	options: SessionIdentityExtensionOptions = {},
) {
	return function sessionIdentityExtension(pi: ExtensionAPI): void {
		let allocator = options.allocator;
		const createConfig = options.createConfig ?? createSessionIdentityConfig;
		const formatSessionName = options.formatSessionName ?? formatAutomaticSessionName;
		const formatTitle = options.formatTitle ?? formatSessionIdentityTitle;
		const reportWarning = options.reportWarning ?? ((message: string) => process.stderr.write(`${message}\n`));
		let lease: SessionNameLease | undefined;
		let pendingTitleRefresh: ReturnType<typeof setImmediate> | undefined;

		function publishTerminalTitle(ctx: ExtensionContext): void {
			if (lease && ctx.hasUI) ctx.ui.setTitle(formatTitle(lease.name, ctx.cwd));
		}

		function clearPendingTitleRefresh(): void {
			if (pendingTitleRefresh === undefined) return;
			clearImmediate(pendingTitleRefresh);
			pendingTitleRefresh = undefined;
		}

		function scheduleTerminalTitleRefresh(ctx: ExtensionContext): void {
			clearPendingTitleRefresh();
			if (!lease || !ctx.hasUI) return;
			pendingTitleRefresh = setImmediate(() => {
				pendingTitleRefresh = undefined;
				publishTerminalTitle(ctx);
			});
		}

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
			publishTerminalTitle(ctx);
		}

		function clearLegacySessionName(identity: string | undefined): void {
			if (identity !== undefined && pi.getSessionName() === identity) {
				pi.setSessionName("");
			}
		}

		function nameUnnamedSession(ctx: ExtensionContext): void {
			if (!lease || pi.getSessionName()) return;
			const createdAt = ctx.sessionManager.getHeader().timestamp;
			pi.setSessionName(formatSessionName(lease.name, createdAt));
		}

		function clearActiveIdentity(identity: string | undefined): void {
			if (identity !== undefined && getActiveSessionIdentity() === identity) {
				setActiveSessionIdentity(undefined);
			}
		}

		pi.on("session_start", async (_event, ctx) => {
			const legacySessionName = consumeLegacySessionDisplayName();
			try {
				allocator ??= new SessionNameAllocator(createConfig());
				lease = await allocator.acquire();
				clearLegacySessionName(legacySessionName);
				nameUnnamedSession(ctx);
				synchronizeIdentity(ctx);
			} catch (error) {
				lease = undefined;
				clearPendingTitleRefresh();
				removeCompanionWidgetContribution(pi.events, COMPANION_CONTRIBUTION_ID);
				clearLegacySessionName(legacySessionName);
				clearActiveIdentity(legacySessionName);
				const message = error instanceof Error ? error.message : String(error);
				const warning = `Session identity unavailable: ${message}`;
				if (ctx.hasUI) ctx.ui.notify(warning, "warning");
				else reportWarning(warning);
			}
		});

		pi.on("resources_discover", async (_event, ctx) => {
			// Pi applies its built-in startup title after extension binding completes.
			scheduleTerminalTitleRefresh(ctx);
		});

		pi.on("session_info_changed", async (_event, ctx) => {
			publishTerminalTitle(ctx);
		});

		pi.on("session_shutdown", async (event, ctx) => {
			clearPendingTitleRefresh();
			removeCompanionWidgetContribution(pi.events, COMPANION_CONTRIBUTION_ID);
			clearActiveIdentity(lease?.name);
			const shouldRelease = event.reason === "quit"
				|| (event.reason === "reload" && options.shouldReleaseOnReload?.() === true);
			if (!shouldRelease || !lease || !allocator) return;
			const releasedLease = lease;
			const releasingAllocator = allocator;
			lease = undefined;
			try {
				await releasingAllocator.release(releasedLease);
			} catch (error) {
				if (ctx.hasUI) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Could not release session identity: ${message}`, "warning");
				}
			} finally {
				clearActiveIdentity(releasedLease.name);
			}
		});
	};
}

export default createSessionIdentityExtension();
