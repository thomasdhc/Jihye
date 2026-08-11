/**
 * Subagent model selection.
 *
 * Bundled agents declare a capability tier and optional provider strategy
 * instead of a pinned model, so the same definitions work across parent
 * providers. Tier and alternate-provider maps live in data
 * (`model-profiles.json`, optionally overridden by the untracked `config.json`)
 * and never in the resolution logic below.
 */
import * as fs from "node:fs";

export const MODEL_TIERS = ["standard", "deep"] as const;

export type ModelTier = typeof MODEL_TIERS[number];

export const MODEL_PROVIDER_STRATEGIES = ["parent", "alternate"] as const;

export type ModelProviderStrategy = typeof MODEL_PROVIDER_STRATEGIES[number];

/** Fully specified `provider/model-id` per tier for one provider. */
export type ProviderProfile = Record<ModelTier, string>;

export interface ModelProfiles {
	/** Profile used when the parent session exposes no active model. */
	defaultProvider: string;
	/** Tier used when an agent definition declares none. */
	defaultTier: ModelTier;
	providers: Record<string, ProviderProfile>;
	/** Parent-provider to alternate-provider routing for independent model selection. */
	alternateProviders: Record<string, string>;
}

/** Provider and model id of the parent session's active model. */
export interface ActiveModel {
	provider?: string;
	id?: string;
}

const TIER_SET = new Set<string>(MODEL_TIERS);
const PROVIDER_STRATEGY_SET = new Set<string>(MODEL_PROVIDER_STRATEGIES);
const PROFILE_KEYS = new Set(["defaultProvider", "defaultTier", "providers", "alternateProviders"]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isModelTier(value: unknown): value is ModelTier {
	return typeof value === "string" && TIER_SET.has(value);
}

export function isModelProviderStrategy(value: unknown): value is ModelProviderStrategy {
	return typeof value === "string" && PROVIDER_STRATEGY_SET.has(value);
}

function requireModelReference(value: unknown, source: string, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid model profiles at ${source}: ${label} must be a non-empty string`);
	}
	const [provider, modelId] = value.split("/");
	if (!provider || !modelId) {
		throw new Error(`Invalid model profiles at ${source}: ${label} must use "provider/model-id" form`);
	}
	return value;
}

function parseProviderProfile(value: unknown, source: string, provider: string): ProviderProfile {
	if (!isObject(value)) {
		throw new Error(`Invalid model profiles at ${source}: providers.${provider} must be a JSON object`);
	}
	const unknownTiers = Object.keys(value).filter((tier) => !TIER_SET.has(tier));
	if (unknownTiers.length > 0) {
		throw new Error(`Invalid model profiles at ${source}: unknown tier(s) for ${provider}: ${unknownTiers.join(", ")}`);
	}
	const profile = {} as ProviderProfile;
	for (const tier of MODEL_TIERS) {
		profile[tier] = requireModelReference(value[tier], source, `providers.${provider}.${tier}`);
	}
	return profile;
}

function parseAlternateProviders(
	value: unknown,
	source: string,
	providers: Record<string, ProviderProfile>,
): Record<string, string> {
	if (value === undefined) return {};
	if (!isObject(value)) {
		throw new Error(`Invalid model profiles at ${source}: alternateProviders must be a JSON object`);
	}

	const alternateProviders: Record<string, string> = {};
	for (const [parentProvider, targetProvider] of Object.entries(value)) {
		if (!parentProvider.trim()) {
			throw new Error(`Invalid model profiles at ${source}: alternateProviders keys must be non-empty`);
		}
		if (typeof targetProvider !== "string" || !targetProvider.trim()) {
			throw new Error(`Invalid model profiles at ${source}: alternateProviders.${parentProvider} must name a provider`);
		}
		if (parentProvider === targetProvider) {
			throw new Error(`Invalid model profiles at ${source}: alternateProviders.${parentProvider} must name a different provider`);
		}
		if (!Object.hasOwn(providers, targetProvider)) {
			throw new Error(`Invalid model profiles at ${source}: alternateProviders.${parentProvider} must name a configured provider`);
		}
		alternateProviders[parentProvider] = targetProvider;
	}
	return alternateProviders;
}

/** Validate a complete profile document, including its internal references. */
export function parseModelProfiles(value: unknown, source = "model-profiles.json"): ModelProfiles {
	if (!isObject(value)) throw new Error(`Invalid model profiles at ${source}: expected a JSON object`);

	const unknownKeys = Object.keys(value).filter((key) => !PROFILE_KEYS.has(key));
	if (unknownKeys.length > 0) {
		throw new Error(`Invalid model profiles at ${source}: unknown key(s): ${unknownKeys.join(", ")}`);
	}
	if (!isModelTier(value.defaultTier)) {
		throw new Error(`Invalid model profiles at ${source}: defaultTier must be one of ${MODEL_TIERS.join(", ")}`);
	}
	if (!isObject(value.providers) || Object.keys(value.providers).length === 0) {
		throw new Error(`Invalid model profiles at ${source}: providers must be a non-empty JSON object`);
	}

	const providers: Record<string, ProviderProfile> = {};
	for (const [provider, profile] of Object.entries(value.providers)) {
		providers[provider] = parseProviderProfile(profile, source, provider);
	}

	const defaultProvider = value.defaultProvider;
	if (typeof defaultProvider !== "string" || !Object.hasOwn(providers, defaultProvider)) {
		throw new Error(`Invalid model profiles at ${source}: defaultProvider must name a configured provider`);
	}
	const alternateProviders = parseAlternateProviders(value.alternateProviders, source, providers);

	return { defaultProvider, defaultTier: value.defaultTier, providers, alternateProviders };
}

/**
 * Apply a partial override on top of validated defaults. Existing providers may
 * override a single tier; new providers must supply every tier.
 */
export function mergeModelProfiles(base: ModelProfiles, override: unknown, source = "config.json"): ModelProfiles {
	if (override === undefined) return base;
	if (!isObject(override)) throw new Error(`Invalid model profiles at ${source}: expected a JSON object`);

	const unknownKeys = Object.keys(override).filter((key) => !PROFILE_KEYS.has(key));
	if (unknownKeys.length > 0) {
		throw new Error(`Invalid model profiles at ${source}: unknown key(s): ${unknownKeys.join(", ")}`);
	}

	const providers: Record<string, ProviderProfile> = {};
	for (const [provider, profile] of Object.entries(base.providers)) {
		providers[provider] = { ...profile };
	}

	const overrideProviders = override.providers;
	if (overrideProviders !== undefined) {
		if (!isObject(overrideProviders)) {
			throw new Error(`Invalid model profiles at ${source}: providers must be a JSON object`);
		}
		for (const [provider, profile] of Object.entries(overrideProviders)) {
			if (!isObject(profile)) {
				throw new Error(`Invalid model profiles at ${source}: providers.${provider} must be a JSON object`);
			}
			const unknownTiers = Object.keys(profile).filter((tier) => !TIER_SET.has(tier));
			if (unknownTiers.length > 0) {
				throw new Error(`Invalid model profiles at ${source}: unknown tier(s) for ${provider}: ${unknownTiers.join(", ")}`);
			}
			const merged = { ...(providers[provider] ?? {}) } as Partial<ProviderProfile>;
			for (const tier of MODEL_TIERS) {
				if (profile[tier] === undefined) continue;
				merged[tier] = requireModelReference(profile[tier], source, `providers.${provider}.${tier}`);
			}
			providers[provider] = parseProviderProfile(merged, source, provider);
		}
	}

	const alternateProviders = {
		...base.alternateProviders,
		...parseAlternateProviders(override.alternateProviders, source, providers),
	};

	return parseModelProfiles({
		defaultProvider: override.defaultProvider ?? base.defaultProvider,
		defaultTier: override.defaultTier ?? base.defaultTier,
		providers,
		alternateProviders,
	}, source);
}

function readJsonFile(filePath: string): unknown {
	const content = fs.readFileSync(filePath, "utf-8");
	try {
		return JSON.parse(content) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON at ${filePath}: ${message}`, { cause: error });
	}
}

/** Load bundled tier defaults and apply an optional workstation override. */
export function loadModelProfiles(profilesPath: string, override?: unknown): ModelProfiles {
	const base = parseModelProfiles(readJsonFile(profilesPath), profilesPath);
	return mergeModelProfiles(base, override);
}

export interface ResolveModelInput {
	/** Explicit `model` from agent frontmatter; always wins when present. */
	pinnedModel?: string;
	tier?: ModelTier;
	providerStrategy?: ModelProviderStrategy;
	profiles: ModelProfiles;
	activeModel?: ActiveModel;
}

/**
 * Resolve the model a subagent should run on.
 *
 * 1. A pinned frontmatter model, so user overrides keep exact control.
 * 2. For the `alternate` strategy, the tier entry for the configured alternate
 *    to the parent session's provider.
 * 3. The tier entry for the parent session's provider.
 * 4. The parent session's own active model, for providers without a profile.
 * 5. The tier entry of the default provider, when no active model is known.
 */
export function resolveAgentModel({
	pinnedModel,
	tier,
	providerStrategy,
	profiles,
	activeModel,
}: ResolveModelInput): string {
	if (pinnedModel) return pinnedModel;

	const resolvedTier = tier ?? profiles.defaultTier;
	const provider = activeModel?.provider;

	if (provider) {
		if (providerStrategy === "alternate" && Object.hasOwn(profiles.alternateProviders, provider)) {
			const alternateProvider = profiles.alternateProviders[provider];
			return profiles.providers[alternateProvider][resolvedTier];
		}
		const profile = Object.hasOwn(profiles.providers, provider) ? profiles.providers[provider] : undefined;
		if (profile) return profile[resolvedTier];
		if (activeModel?.id) return `${provider}/${activeModel.id}`;
	}

	return profiles.providers[profiles.defaultProvider][resolvedTier];
}
