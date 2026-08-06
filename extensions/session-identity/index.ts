import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	getActiveSessionIdentity,
	setActiveSessionIdentity,
} from "../../lib/session-identity.ts";
import {
	SessionNameAllocator,
	type SessionNameLease,
} from "./allocator.ts";
import {
	createSessionIdentityConfig,
	type SessionIdentityConfig,
} from "./config.ts";

interface SessionLeaseAllocator {
	acquire(): Promise<SessionNameLease>;
	release(lease: SessionNameLease): Promise<boolean>;
}

interface SessionIdentityExtensionOptions {
	allocator?: SessionLeaseAllocator;
	createConfig?: () => SessionIdentityConfig;
	formatTitle?: (name: string, cwd: string) => string;
	reportWarning?: (message: string) => void;
}

export function formatSessionIdentityTitle(name: string, cwd: string): string {
	return `π - ${name} - ${basename(cwd) || cwd}`;
}

export function createSessionIdentityExtension(
	options: SessionIdentityExtensionOptions = {},
) {
	return function sessionIdentityExtension(pi: ExtensionAPI): void {
		let allocator = options.allocator;
		const createConfig = options.createConfig ?? createSessionIdentityConfig;
		const formatTitle = options.formatTitle ?? formatSessionIdentityTitle;
		const reportWarning = options.reportWarning ?? ((message: string) => process.stderr.write(`${message}\n`));
		let lease: SessionNameLease | undefined;
		let restoringName = false;

		function synchronizeIdentity(ctx: ExtensionContext): void {
			if (!lease) return;
			setActiveSessionIdentity(lease.name);
			if (ctx.hasUI) ctx.ui.setTitle(formatTitle(lease.name, ctx.cwd));
		}

		function clearActiveIdentity(): void {
			const activeIdentity = getActiveSessionIdentity();
			if (activeIdentity === undefined) return;
			setActiveSessionIdentity(undefined);
			if (pi.getSessionName() === activeIdentity) pi.setSessionName("");
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
				allocator ??= new SessionNameAllocator(createConfig());
				lease = await allocator.acquire();
				enforceSessionName(ctx);
			} catch (error) {
				clearActiveIdentity();
				const message = error instanceof Error ? error.message : String(error);
				const warning = `Session identity unavailable: ${message}`;
				if (ctx.hasUI) ctx.ui.notify(warning, "warning");
				else reportWarning(warning);
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
			if (event.reason !== "quit" || !lease || !allocator) return;
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
				if (getActiveSessionIdentity() === releasedLease.name) {
					setActiveSessionIdentity(undefined);
				}
			}
		});
	};
}

export default createSessionIdentityExtension();
