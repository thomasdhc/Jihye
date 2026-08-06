export interface SlackConfig {
	token: string;
}

export interface SlackTokenVault {
	token?: string;
}

const TOKEN_VAULT_KEY = Symbol.for("pi-extensio.slack-token-vault");

function globalTokenVault(): SlackTokenVault {
	const root = globalThis as typeof globalThis & {
		[TOKEN_VAULT_KEY]?: SlackTokenVault;
	};
	root[TOKEN_VAULT_KEY] ??= {};
	return root[TOKEN_VAULT_KEY];
}

export function loadSlackConfig(env: NodeJS.ProcessEnv = process.env): SlackConfig {
	const token = env.SLACK_USER_TOKEN?.trim();
	if (!token) {
		throw new Error(
			"Missing Slack credentials. Set SLACK_USER_TOKEN to an OAuth user token from an approved internal Slack app.",
		);
	}
	if (!token.startsWith("xoxp-")) {
		throw new Error(
			"SLACK_USER_TOKEN must be an OAuth user token beginning with xoxp-. Browser/session and bot tokens are not supported.",
		);
	}
	return { token };
}

/**
 * Move the Slack token out of the process environment so ordinary bash and
 * subagent children cannot inherit it. The global vault survives Pi /reload.
 */
export function captureSlackUserToken(
	env: NodeJS.ProcessEnv = process.env,
	vault: SlackTokenVault = globalTokenVault(),
): string | undefined {
	const rawToken = env.SLACK_USER_TOKEN;
	delete env.SLACK_USER_TOKEN;
	if (rawToken?.trim()) {
		vault.token = loadSlackConfig({ SLACK_USER_TOKEN: rawToken }).token;
	}
	return vault.token;
}
