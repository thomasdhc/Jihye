const SESSION_IDENTITY_STATE = Symbol.for("jihye.session-identity.state");

interface SessionIdentityState {
	name?: string;
	legacySessionDisplayNameConsumed?: boolean;
}

type GlobalWithSessionIdentity = typeof globalThis & {
	[SESSION_IDENTITY_STATE]?: SessionIdentityState;
};

function getState(): SessionIdentityState {
	const globalState = globalThis as GlobalWithSessionIdentity;
	globalState[SESSION_IDENTITY_STATE] ??= {};
	return globalState[SESSION_IDENTITY_STATE];
}

export function consumeLegacySessionDisplayName(): string | undefined {
	const state = getState();
	if (state.legacySessionDisplayNameConsumed === true) return undefined;
	state.legacySessionDisplayNameConsumed = true;
	return state.name;
}

export function getActiveSessionIdentity(): string | undefined {
	return getState().name;
}

export function setActiveSessionIdentity(name: string | undefined): void {
	const state = getState();
	state.name = name;
	if (name === undefined) state.legacySessionDisplayNameConsumed = false;
}
