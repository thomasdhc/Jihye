import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_STATES,
	getPiPetAnimationInterval,
	getPiPetStateCycleLength,
	isPiPetStateAnimated,
	resolvePiPetStateElements,
} from "../../extensions/widget/pi-pet/assets.ts";
import {
	formatPiPetPreview,
	getPiPetPreviewRefreshInterval,
	getPiPetSpriteOptions,
	parsePiPetPreviewArgs,
} from "../../scripts/preview-pi-pet.ts";

function assertAlignedSpriteGallery(preview: string, label: string): void {
	const lines = preview.split("\n");
	const labelIndex = lines.indexOf(label);
	assert.notEqual(labelIndex, -1, `missing ${label} gallery`);
	const galleryRows = lines.slice(labelIndex + 2, labelIndex + 7);
	assert.equal(galleryRows.length, 5);
	assert.equal(new Set(galleryRows.map(visibleWidth)).size, 1, `${label} rows align`);
	for (const row of galleryRows.slice(1, -1)) {
		assert.ok(row.startsWith("|") && row.endsWith("|"), `${label} frame boundaries align`);
	}
}

test("formats an aligned one-shot preview for every sprite and lifecycle state", () => {
	const preview = formatPiPetPreview();
	const lines = preview.split("\n");
	const sprites: Array<[label: string, agentName?: string]> = [
		["default"],
		...Object.keys(PI_PET_ASSETS.subagents).map((name) => [`subagent:${name}`, name] as const),
	];

	for (const [label] of sprites) {
		const labelIndex = lines.indexOf(label);
		assert.notEqual(labelIndex, -1, label);
		assert.ok(PI_PET_STATES.every((state) => lines[labelIndex + 1]?.includes(state)));
		assertAlignedSpriteGallery(preview, label);
	}

	const animatedHeading = sprites.flatMap(([label, agentName]) =>
		PI_PET_STATES.map((state) => ({
			label,
			state,
			cycleLength: getPiPetStateCycleLength(state, agentName),
		})),
	).find(({ cycleLength }) => cycleLength > 1);
	assert.ok(animatedHeading, "catalog includes a previewable animation");
	assert.ok(
		lines[lines.indexOf(animatedHeading.label) + 1]?.includes(
			`${animatedHeading.state}×${animatedHeading.cycleLength}`,
		),
		"one-shot output exposes catalog-derived animation cycle counts",
	);
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
	const options = getPiPetSpriteOptions();
	assert.throws(
		() => parsePiPetPreviewArgs(["--sprite", "unknown"]),
		new RegExp(`Invalid --sprite choice.*Options: ${options.join(", ")}`),
	);
	assert.throws(
		() => parsePiPetPreviewArgs(["--sprite"]),
		new RegExp(`Missing value for --sprite\\. Options: ${options.join(", ")}`),
	);
	const filteredSprite = options.find((option) => option !== "default");
	assert.ok(filteredSprite);
	assert.deepEqual(parsePiPetPreviewArgs(["--watch-mode", `--sprite=${filteredSprite}`]), {
		watchMode: true,
		sprite: filteredSprite,
	});
});

test("live preview formatting advances catalog animation and preserves alignment", () => {
	const animatedState = PI_PET_STATES.find((state) => {
		if (!isPiPetStateAnimated(state)) return false;
		return resolvePiPetStateElements(state, 0).some(
			(line, index) => line !== resolvePiPetStateElements(state, 1)[index],
		);
	});
	assert.ok(animatedState, "default sprite includes a visible animation");
	const intervalMs = getPiPetAnimationInterval(animatedState);
	const initial = formatPiPetPreview({ sprite: "default", elapsedMs: 0 });
	const next = formatPiPetPreview({ sprite: "default", elapsedMs: intervalMs });
	const initialFrame = resolvePiPetStateElements(animatedState, 0);
	const nextFrame = resolvePiPetStateElements(animatedState, 1);

	assert.notDeepEqual(initialFrame, nextFrame);
	for (const line of initialFrame) assert.ok(initial.includes(`|${line}|`));
	for (const line of nextFrame) assert.ok(next.includes(`|${line}|`));
	assert.notEqual(initial, next);
	assertAlignedSpriteGallery(next, "default");

	const refreshInterval = getPiPetPreviewRefreshInterval("default");
	assert.ok(refreshInterval > 0);
	for (const state of PI_PET_STATES.filter((candidate) => isPiPetStateAnimated(candidate))) {
		assert.equal(getPiPetAnimationInterval(state) % refreshInterval, 0);
	}
});
