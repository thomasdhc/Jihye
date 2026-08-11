import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	loadModelProfiles,
	mergeModelProfiles,
	type ModelProfiles,
	parseModelProfiles,
	resolveAgentModel,
} from "../extensions/subagent/models.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_PROFILES_PATH = join(REPO_ROOT, "extensions", "subagent", "model-profiles.json");

function bundledProfiles(): ModelProfiles {
	return loadModelProfiles(MODEL_PROFILES_PATH);
}

test("bundles a tier map for every supported provider", () => {
	const profiles = bundledProfiles();

	assert.equal(profiles.defaultProvider, "openai-codex");
	assert.equal(profiles.defaultTier, "standard");
	assert.deepEqual(profiles.alternateProviders, {
		openai: "anthropic",
		"openai-codex": "anthropic",
		anthropic: "openai-codex",
	});
	assert.deepEqual(profiles.providers["openai-codex"], {
		standard: "openai-codex/gpt-5.6-sol",
		deep: "openai-codex/gpt-5.6-sol",
	});
	assert.deepEqual(profiles.providers.anthropic, {
		standard: "anthropic/claude-sonnet-5",
		deep: "anthropic/claude-opus-5",
	});
});

test("selects the tier model of the parent session provider", () => {
	const profiles = bundledProfiles();

	assert.equal(
		resolveAgentModel({ tier: "standard", profiles, activeModel: { provider: "anthropic", id: "claude-opus-5" } }),
		"anthropic/claude-sonnet-5",
	);
	assert.equal(
		resolveAgentModel({ tier: "deep", profiles, activeModel: { provider: "anthropic", id: "claude-sonnet-5" } }),
		"anthropic/claude-opus-5",
	);
	assert.equal(
		resolveAgentModel({ tier: "deep", profiles, activeModel: { provider: "openai-codex", id: "gpt-5.5" } }),
		"openai-codex/gpt-5.6-sol",
	);
});

test("keeps alternate-provider selection disabled by default", () => {
	const profiles = bundledProfiles();

	assert.equal(
		resolveAgentModel({
			tier: "standard",
			alternateTier: "deep",
			providerStrategy: "alternate",
			profiles,
			activeModel: { provider: "anthropic", id: "claude-opus-5" },
		}),
		"anthropic/claude-sonnet-5",
	);
});

test("selects the alternate provider's alternate tier when locally enabled", () => {
	const profiles = bundledProfiles();
	const selection = {
		tier: "standard" as const,
		alternateTier: "deep" as const,
		providerStrategy: "alternate" as const,
		enableAlternateProviders: true,
		profiles,
	};

	assert.equal(
		resolveAgentModel({
			...selection,
			activeModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
		}),
		"anthropic/claude-opus-5",
	);
	assert.equal(
		resolveAgentModel({
			...selection,
			activeModel: { provider: "anthropic", id: "claude-opus-5" },
		}),
		"openai-codex/gpt-5.6-sol",
	);
	assert.equal(
		resolveAgentModel({
			...selection,
			activeModel: { provider: "openai", id: "gpt-5.6-sol" },
		}),
		"anthropic/claude-opus-5",
	);
});

test("prefers a pinned frontmatter model over any tier or provider strategy", () => {
	const profiles = bundledProfiles();

	assert.equal(
		resolveAgentModel({
			pinnedModel: "openai-codex/gpt-5.4-mini",
			tier: "standard",
			alternateTier: "deep",
			providerStrategy: "alternate",
			enableAlternateProviders: true,
			profiles,
			activeModel: { provider: "anthropic", id: "claude-opus-5" },
		}),
		"openai-codex/gpt-5.4-mini",
	);
});

test("falls back to the parent active model for unprofiled and unmapped providers", () => {
	const profiles = bundledProfiles();

	assert.equal(
		resolveAgentModel({ tier: "deep", profiles, activeModel: { provider: "google", id: "gemini-3-pro" } }),
		"google/gemini-3-pro",
	);
	assert.equal(
		resolveAgentModel({
			tier: "standard",
			alternateTier: "deep",
			providerStrategy: "alternate",
			enableAlternateProviders: true,
			profiles,
			activeModel: { provider: "google", id: "gemini-3-pro" },
		}),
		"google/gemini-3-pro",
	);
	for (const provider of ["toString", "constructor"]) {
		assert.equal(
			resolveAgentModel({
				tier: "standard",
				alternateTier: "deep",
				providerStrategy: "alternate",
				enableAlternateProviders: true,
				profiles,
				activeModel: { provider, id: "custom-model" },
			}),
			`${provider}/custom-model`,
		);
	}
});

test("falls back to the default provider tier without an active model", () => {
	const profiles = bundledProfiles();

	assert.equal(resolveAgentModel({ tier: "deep", profiles }), "openai-codex/gpt-5.6-sol");
	assert.equal(resolveAgentModel({ profiles }), "openai-codex/gpt-5.6-sol");
	assert.equal(
		resolveAgentModel({ tier: "deep", profiles, activeModel: { provider: "google" } }),
		"openai-codex/gpt-5.6-sol",
	);
});

test("merges a workstation override over the bundled tier maps", () => {
	const merged = mergeModelProfiles(bundledProfiles(), {
		providers: {
			anthropic: { deep: "anthropic/claude-opus-4-8" },
			google: { standard: "google/gemini-3-flash", deep: "google/gemini-3-pro" },
		},
		alternateProviders: { anthropic: "google" },
	});

	assert.equal(merged.providers.anthropic.deep, "anthropic/claude-opus-4-8");
	assert.equal(merged.providers.anthropic.standard, "anthropic/claude-sonnet-5");
	assert.equal(merged.alternateProviders.anthropic, "google");
	assert.equal(
		resolveAgentModel({ tier: "standard", profiles: merged, activeModel: { provider: "google", id: "gemini-3-pro" } }),
		"google/gemini-3-flash",
	);
	assert.equal(
		resolveAgentModel({
			tier: "standard",
			alternateTier: "deep",
			providerStrategy: "alternate",
			enableAlternateProviders: true,
			profiles: merged,
			activeModel: { provider: "anthropic", id: "claude-opus-5" },
		}),
		"google/gemini-3-pro",
	);
});

test("keeps bundled profiles unchanged when no override is configured", () => {
	const base = bundledProfiles();

	assert.deepEqual(mergeModelProfiles(base, undefined), base);
});

test("rejects malformed profile documents and overrides", () => {
	const base = bundledProfiles();

	assert.throws(() => parseModelProfiles([], "fixture"), /expected a JSON object/);
	assert.throws(
		() => parseModelProfiles({ defaultProvider: "openai-codex", defaultTier: "turbo", providers: {} }, "fixture"),
		/defaultTier must be one of/,
	);
	for (const defaultProvider of ["missing", "toString"]) {
		assert.throws(
			() => parseModelProfiles({
				defaultProvider,
				defaultTier: "standard",
				providers: { anthropic: { standard: "anthropic/claude-sonnet-5", deep: "anthropic/claude-opus-5" } },
			}, "fixture"),
			/defaultProvider must name a configured provider/,
		);
	}
	assert.throws(
		() => parseModelProfiles({
			defaultProvider: "anthropic",
			defaultTier: "standard",
			providers: { anthropic: { standard: "claude-sonnet-5", deep: "anthropic/claude-opus-5" } },
		}, "fixture"),
		/must use "provider\/model-id" form/,
	);
	assert.throws(
		() => mergeModelProfiles(base, { providers: { google: { standard: "google/gemini-3-flash" } } }, "fixture"),
		/providers.google.deep must be a non-empty string/,
	);
	assert.throws(
		() => mergeModelProfiles(base, { providers: { anthropic: { turbo: "anthropic/claude-opus-5" } } }, "fixture"),
		/unknown tier\(s\) for anthropic: turbo/,
	);
	assert.throws(
		() => mergeModelProfiles(base, { alternateProviders: { anthropic: "missing" } }, "fixture"),
		/alternateProviders.anthropic must name a configured provider/,
	);
	assert.throws(
		() => mergeModelProfiles(base, { alternateProviders: { anthropic: "toString" } }, "fixture"),
		/alternateProviders.anthropic must name a configured provider/,
	);
	assert.throws(
		() => mergeModelProfiles(base, { alternateProviders: { anthropic: "anthropic" } }, "fixture"),
		/alternateProviders.anthropic must name a different provider/,
	);
	assert.throws(() => mergeModelProfiles(base, { unknown: true }, "fixture"), /unknown key\(s\): unknown/);
});
