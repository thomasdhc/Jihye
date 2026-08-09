import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_STATES,
	validatePiPetAssets,
} from "../../extensions/widget/pi-pet-assets.ts";
import { renderPiPetStateLines } from "../../extensions/widget/pi-pet.ts";

test("validates every default and subagent asset across every lifecycle state", () => {
	assert.doesNotThrow(() => validatePiPetAssets());

	const spriteNames = [undefined, ...Object.keys(PI_PET_ASSETS.subagents)];
	for (const agentName of spriteNames) {
		for (const state of PI_PET_STATES) {
			const lines = renderPiPetStateLines(state, agentName);
			assert.equal(lines.length, 3, `${agentName ?? "default"}.${state} row count`);
			assert.deepEqual(
				lines.map(visibleWidth),
				Array(lines.length).fill(PI_PET_ASSETS.frameWidth),
				`${agentName ?? "default"}.${state} display widths`,
			);
		}
	}
});

test("reports the asset, state, row, and display widths for oversized frames", () => {
	const invalidAssets = {
		...PI_PET_ASSETS,
		default: {
			...PI_PET_ASSETS.default,
			top: "x".repeat(PI_PET_ASSETS.frameWidth + 1),
		},
	};

	assert.throws(
		() => validatePiPetAssets(invalidAssets),
		new RegExp(
			`default\\.idle top has display width ${PI_PET_ASSETS.frameWidth + 1}; expected ${PI_PET_ASSETS.frameWidth}`,
		),
	);
});
