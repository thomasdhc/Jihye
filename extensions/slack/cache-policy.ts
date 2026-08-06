import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type RuntimeProvider = NonNullable<ReturnType<ExtensionContext["modelRegistry"]["getProvider"]>>;
type DeferredProviderMethods = {
	fetchDeferred?: (...args: unknown[]) => unknown;
	cancelDeferred?: (...args: unknown[]) => unknown;
};
type RuntimeProviderWithDeferred = RuntimeProvider & DeferredProviderMethods;

/**
 * Preserve the selected provider's models, auth, and transport while forcing
 * every model request to opt out of Pi-managed prompt caching.
 */
export function withoutPromptCaching(provider: RuntimeProvider): RuntimeProvider {
	const source = provider as RuntimeProviderWithDeferred;
	const wrapped: RuntimeProviderWithDeferred = {
		id: provider.id,
		name: provider.name,
		baseUrl: provider.baseUrl,
		headers: provider.headers,
		auth: provider.auth,
		getModels: provider.getModels.bind(provider),
		...(provider.refreshModels
			? { refreshModels: provider.refreshModels.bind(provider) }
			: {}),
		...(provider.filterModels
			? { filterModels: provider.filterModels.bind(provider) }
			: {}),
		stream: ((model, context, options) => provider.stream(
			model,
			context,
			{ ...options, cacheRetention: "none" },
		)) as RuntimeProvider["stream"],
		streamSimple: (model, context, options) => provider.streamSimple(
			model,
			context,
			{ ...options, cacheRetention: "none" },
		),
	};
	if (source.fetchDeferred) {
		wrapped.fetchDeferred = source.fetchDeferred.bind(provider);
	}
	if (source.cancelDeferred) {
		wrapped.cancelDeferred = source.cancelDeferred.bind(provider);
	}
	return wrapped;
}

export function installNoPromptCacheProvider(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): void {
	if (!ctx.model) throw new Error("Slack consultation child has no selected model.");
	const provider = ctx.modelRegistry.getProvider(ctx.model.provider);
	if (!provider) {
		throw new Error(`Slack consultation provider is unavailable: ${ctx.model.provider}`);
	}
	pi.registerProvider(withoutPromptCaching(provider));
}
