import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installNoPromptCacheProvider } from "../extensions/slack/cache-policy.ts";
import { createSlackExtension } from "../extensions/slack/index.ts";

/** Dedicated entrypoint loaded only by the no-session Slack consultation child. */
export default function slackChildExtension(pi: ExtensionAPI): void {
	let cachePolicyReady = false;

	pi.on("session_start", (_event, ctx) => {
		try {
			installNoPromptCacheProvider(pi, ctx);
			cachePolicyReady = true;
		} catch {
			process.exitCode = 1;
			ctx.shutdown();
		}
	});
	pi.on("input", (_event, ctx) => {
		if (cachePolicyReady) return { action: "continue" };
		process.exitCode = 1;
		ctx.shutdown();
		return { action: "handled" };
	});

	createSlackExtension()(pi);
}
