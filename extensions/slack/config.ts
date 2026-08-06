export interface SlackConfig {
	token: string;
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
