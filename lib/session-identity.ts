const SESSION_IDENTITY_STATE = Symbol.for("pi-extensio.session-identity.state");

interface SessionIdentityState {
	name?: string;
}

type GlobalWithSessionIdentity = typeof globalThis & {
	[SESSION_IDENTITY_STATE]?: SessionIdentityState;
};

function getState(): SessionIdentityState {
	const globalState = globalThis as GlobalWithSessionIdentity;
	globalState[SESSION_IDENTITY_STATE] ??= {};
	return globalState[SESSION_IDENTITY_STATE];
}

export function getActiveSessionIdentity(): string | undefined {
	return getState().name;
}

export function setActiveSessionIdentity(name: string | undefined): void {
	getState().name = name;
}
