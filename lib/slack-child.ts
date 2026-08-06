import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSlackExtension } from "../extensions/slack/index.ts";

/** Dedicated entrypoint loaded only by the no-session Slack consultation child. */
export default function slackChildExtension(pi: ExtensionAPI): void {
	createSlackExtension()(pi);
}
