import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_DEFAULT_ANIMATION_INTERVAL_MS,
	PI_PET_STATES,
	createPiPetModeAssets,
	getPiPetAnimationInterval,
	getPiPetElementAlternativeCount,
	getPiPetStateCycleLength,
	resolvePiPetElement,
	resolvePiPetStateElements,
	validatePiPetAssets,
	type PiPetAssetCatalog,
	type PiPetElement,
	type PiPetStateFrameMap,
} from "../../extensions/widget/pi-pet/assets.ts";

function repeatFrame(element: PiPetElement): PiPetStateFrameMap {
	return {
		idle: element,
		thinking: element,
		working: element,
		success: element,
		error: element,
	};
}

test("models every lifecycle state as three exact-width ordered elements", () => {
	assert.doesNotThrow(() => validatePiPetAssets());

	const modes = [PI_PET_ASSETS.default, ...Object.values(PI_PET_ASSETS.subagents)];
	for (const mode of modes) {
		for (const state of PI_PET_STATES) {
			const { elements } = mode[state];
			assert.equal(elements.length, 3);
			for (const element of elements) {
				const alternatives = typeof element === "string" ? [element] : element;
				assert.ok(alternatives.length > 0);
				assert.deepEqual(alternatives.map(visibleWidth), alternatives.map(() => PI_PET_ASSETS.frameWidth));
			}
		}
	}
});

test("maps named top, face, and bottom rows into every runtime state", () => {
	const top: PiPetStateFrameMap = {
		idle: "tiiiiii",
		thinking: "thhhhhh",
		working: "twwwwww",
		success: "tssssss",
		error: "teeeeee",
	};
	const face: PiPetStateFrameMap = {
		idle: "fiiiiii",
		thinking: "fhhhhhh",
		working: "fwwwwww",
		success: "fssssss",
		error: "feeeeee",
	};
	const bottom: PiPetStateFrameMap = {
		idle: "biiiiii",
		thinking: "bhhhhhh",
		working: "bwwwwww",
		success: "bssssss",
		error: "beeeeee",
	};
	const mode = createPiPetModeAssets({ top, face, bottom });

	for (const state of PI_PET_STATES) {
		assert.deepEqual(mode[state].elements, [top[state], face[state], bottom[state]]);
	}
});

test("advances top, face, and bottom arrays from the shared state tick", () => {
	const top = ["aaaaaaa", "bbbbbbb"] as const satisfies PiPetElement;
	const face = ["1111111", "2222222", "3333333"] as const satisfies PiPetElement;
	const bottom = ["-------", "=======", "+++++++", "xxxxxxx"] as const satisfies PiPetElement;
	const assets = {
		...PI_PET_ASSETS,
		default: createPiPetModeAssets({
			top: { ...repeatFrame("ttttttt"), working: top },
			face: { ...repeatFrame("fffffff"), working: face },
			bottom: { ...repeatFrame("bbbbbbb"), working: bottom },
		}),
	} satisfies PiPetAssetCatalog;

	assert.equal(resolvePiPetElement(top, 5), "bbbbbbb");
	assert.equal(resolvePiPetElement(face, 5), "3333333");
	assert.equal(resolvePiPetElement(bottom, 5), "=======");
	assert.equal(getPiPetElementAlternativeCount(top), 2);
	assert.equal(getPiPetElementAlternativeCount(face), 3);
	assert.equal(getPiPetElementAlternativeCount(bottom), 4);
	assert.deepEqual(resolvePiPetStateElements("working", 5, undefined, assets), [
		"bbbbbbb",
		"3333333",
		"=======",
	]);
	assert.equal(getPiPetStateCycleLength("working", undefined, assets), 12);
});

test("uses a 800ms default with state-level asset overrides", () => {
	assert.equal(PI_PET_ASSETS.defaultIntervalMs, PI_PET_DEFAULT_ANIMATION_INTERVAL_MS);
	assert.equal(getPiPetAnimationInterval("working"), 800);

	const overridden = {
		...PI_PET_ASSETS,
		default: {
			...PI_PET_ASSETS.default,
			working: { ...PI_PET_ASSETS.default.working, intervalMs: 125 },
		},
	};
	assert.equal(getPiPetAnimationInterval("working", undefined, overridden), 125);
});

test("rejects short alternatives instead of padding them at runtime", () => {
	const invalidAssets = {
		...PI_PET_ASSETS,
		default: {
			...PI_PET_ASSETS.default,
			idle: {
				elements: ["short", ...PI_PET_ASSETS.default.idle.elements.slice(1)],
			},
		},
	} as never;

	assert.throws(
		() => validatePiPetAssets(invalidAssets),
		/default\.idle element 0 has display width 5; expected 7/,
	);
});

test("rejects empty alternative lists", () => {
	const invalidAssets = {
		...PI_PET_ASSETS,
		default: {
			...PI_PET_ASSETS.default,
			working: {
				elements: [
					PI_PET_ASSETS.default.working.elements[0],
					PI_PET_ASSETS.default.working.elements[1],
					[],
				],
			},
		},
	} as never;

	assert.throws(
		() => validatePiPetAssets(invalidAssets),
		/default\.working element 2 alternatives must be a non-empty readonly list/,
	);
});
