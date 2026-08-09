import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import { PI_PET_ASSETS, PI_PET_STATES } from "../../extensions/widget/pi-pet-assets.ts";
import { formatPiPetPreview } from "../../scripts/preview-pi-pet.ts";

test("formats a bounded preview for every sprite and lifecycle state", () => {
	const preview = formatPiPetPreview();
	const lines = preview.split("\n");
	const labels = ["default", ...Object.keys(PI_PET_ASSETS.subagents).map((name) => `subagent:${name}`)];

	for (const label of labels) assert.ok(lines.includes(label), label);
	assert.equal(
		lines.filter((line) => PI_PET_STATES.every((state) => line.includes(state))).length,
		labels.length,
		"one state heading row per sprite",
	);

	const framedRows = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
	assert.equal(framedRows.length, labels.length * 3);
	const expectedGalleryWidth =
		PI_PET_STATES.length * (PI_PET_ASSETS.frameWidth + 2) + (PI_PET_STATES.length - 1) * 2;
	for (const row of framedRows) assert.equal(visibleWidth(row), expectedGalleryWidth);
});
