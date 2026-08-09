import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import { PI_PET_ASSETS, PI_PET_STATES } from "../../extensions/widget/pi-pet-assets.ts";
import {
	formatPiPetPreview,
	getPiPetPreviewRefreshInterval,
	parsePiPetPreviewArgs,
} from "../../scripts/preview-pi-pet.ts";

test("formats a bounded one-shot preview for every sprite and lifecycle state", () => {
	const preview = formatPiPetPreview();
	const lines = preview.split("\n");
	const labels = ["default", ...Object.keys(PI_PET_ASSETS.subagents).map((name) => `subagent:${name}`)];

	for (const label of labels) assert.ok(lines.includes(label), label);
	assert.equal(
		lines.filter((line) => PI_PET_STATES.every((state) => line.includes(state))).length,
		labels.length,
		"one state heading row per sprite",
	);
	assert.ok(lines.some((line) => line.includes("working×4")), "one-shot output exposes animation cycle counts");

	const framedRows = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
	assert.equal(framedRows.length, labels.length * 3);
	const expectedGalleryWidth =
		PI_PET_STATES.length * (PI_PET_ASSETS.frameWidth + 2) + (PI_PET_STATES.length - 1) * 2;
	for (const row of framedRows) assert.equal(visibleWidth(row), expectedGalleryWidth);
});

test("filters one-shot and live previews to the requested sprite", () => {
	const scout = formatPiPetPreview({ sprite: "scout" });
	assert.ok(scout.includes("subagent:scout"));
	assert.equal(scout.includes("\ndefault\n"), false);
	assert.equal(scout.includes("subagent:researcher"), false);

	const defaultPreview = formatPiPetPreview({ sprite: "default" });
	assert.ok(defaultPreview.includes("\ndefault\n"));
	assert.equal(defaultPreview.includes("subagent:"), false);
});

test("reports invalid sprite choices with every available option", () => {
	assert.throws(
		() => parsePiPetPreviewArgs(["--sprite", "unknown"]),
		new RegExp(`Invalid --sprite choice.*Options: ${["default", ...Object.keys(PI_PET_ASSETS.subagents)].join(", ")}`),
	);
	assert.throws(
		() => parsePiPetPreviewArgs(["--sprite"]),
		/Missing value for --sprite\. Options: default, scout, researcher, reviewer, engineer, coordinator/,
	);
	assert.deepEqual(parsePiPetPreviewArgs(["--watch-mode", "--sprite=scout"]), {
		watchMode: true,
		sprite: "scout",
	});
});

test("live preview formatting advances animated columns and preserves frame widths", () => {
	const initial = formatPiPetPreview({ sprite: "default", elapsedMs: 0 });
	const next = formatPiPetPreview({ sprite: "default", elapsedMs: 250 });

	assert.ok(initial.includes("| > ◐ < |"));
	assert.ok(next.includes("| > ◓ < |"));
	assert.notEqual(initial, next);
	for (const line of next.split("\n").filter((candidate) => candidate.startsWith("|") && candidate.endsWith("|"))) {
		assert.equal(visibleWidth(line), 53);
	}
	assert.equal(getPiPetPreviewRefreshInterval("default"), 250);
});
