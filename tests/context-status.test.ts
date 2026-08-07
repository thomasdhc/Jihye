import assert from "node:assert/strict";
import test from "node:test";

import { contextBar, createContextStatusPayload, formatTokenCount } from "../extensions/widget/context-status.ts";

test("formats compact context status payloads", () => {
	assert.equal(formatTokenCount(999), "999");
	assert.equal(formatTokenCount(115000), "115k");
	assert.equal(contextBar(0.42), "████░░░░░░");
	assert.deepEqual(createContextStatusPayload({ tokens: 115000, contextWindow: 272000 }), {
		tokens: 115000,
		contextWindow: 272000,
		percent: 115000 / 272000,
		label: "ctx [████░░░░░░] 42% (115k/272k)",
	});
});
