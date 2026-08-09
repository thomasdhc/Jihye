import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	PI_PET_ASSETS,
	PI_PET_DEFAULT_ANIMATION_INTERVAL_MS,
	PI_PET_STATES,
	getPiPetAnimationInterval,
	getPiPetElementAlternativeCount,
	getPiPetStateCycleLength,
	resolvePiPetElement,
	resolvePiPetStateElements,
	validatePiPetAssets,
	type PiPetAssetCatalog,
	type PiPetElement,
} from "../../extensions/widget/pi-pet/assets.ts";

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

test("resolves each animated element with its own modular cycle", () => {
	const pairs = ["aaaaaaa", "bbbbbbb"] as const satisfies PiPetElement;
	const triples = ["1111111", "2222222", "3333333"] as const satisfies PiPetElement;
	const assets = {
		...PI_PET_ASSETS,
		default: {
			...PI_PET_ASSETS.default,
			working: { elements: [pairs, "-------", triples] },
		},
	} satisfies PiPetAssetCatalog;

	assert.equal(resolvePiPetElement(pairs, 5), "bbbbbbb");
	assert.equal(resolvePiPetElement(triples, 5), "3333333");
	assert.equal(getPiPetElementAlternativeCount(pairs), 2);
	assert.equal(getPiPetElementAlternativeCount(triples), 3);
	assert.deepEqual(resolvePiPetStateElements("working", 5, undefined, assets), [
		"bbbbbbb",
		"-------",
		"3333333",
	]);
	assert.equal(getPiPetStateCycleLength("working", undefined, assets), 6);
});

test("uses a 250ms default with state-level asset overrides", () => {
	assert.equal(PI_PET_ASSETS.defaultIntervalMs, PI_PET_DEFAULT_ANIMATION_INTERVAL_MS);
	assert.equal(getPiPetAnimationInterval("working"), 250);

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
