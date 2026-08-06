import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface SlackConfig {
	token: string;
}

export interface SlackTokenVault {
	token?: string;
}

const SLACK_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const SLACK_MODEL_CONFIG_NAME = "pi-slack-model.json";
const MAX_SLACK_MODEL_CONFIG_BYTES = 4_096;

const TOKEN_VAULT_KEY = Symbol.for("pi-extensio.slack-token-vault");

function globalTokenVault(): SlackTokenVault {
	const root = globalThis as typeof globalThis & {
		[TOKEN_VAULT_KEY]?: SlackTokenVault;
	};
	root[TOKEN_VAULT_KEY] ??= {};
	return root[TOKEN_VAULT_KEY];
}

export function slackModelConfigPath(env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
	return path.join(agentDir, SLACK_MODEL_CONFIG_NAME);
}

function validateSlackConsultModel(model: unknown, source: string): string {
	if (typeof model !== "string") {
		throw new Error(`${source} must contain a string provider/model identifier.`);
	}
	const normalized = model.trim();
	if (normalized.length > 256 || !SLACK_MODEL_PATTERN.test(normalized)) {
		throw new Error(
			`${source} must use a provider/model identifier without whitespace and at most 256 characters.`,
		);
	}
	return normalized;
}

export function loadSlackConsultModel(
	env: NodeJS.ProcessEnv = process.env,
	configPath = slackModelConfigPath(env),
): string {
	if (env.PI_SLACK_MODEL?.trim()) {
		return validateSlackConsultModel(env.PI_SLACK_MODEL, "PI_SLACK_MODEL");
	}

	let stats: fs.Stats;
	try {
		stats = fs.statSync(configPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(
				`Set PI_SLACK_MODEL=provider/model or create ${configPath} with {\"model\":\"provider/model\"}. Slack consultation never inherits the parent model.`,
			);
		}
		throw new Error(`Cannot read Slack model config ${configPath}.`);
	}
	if (!stats.isFile() || stats.size > MAX_SLACK_MODEL_CONFIG_BYTES) {
		throw new Error(`Slack model config ${configPath} must be a file no larger than 4096 bytes.`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch {
		throw new Error(`Slack model config ${configPath} must contain valid JSON.`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Slack model config ${configPath} must contain a JSON object.`);
	}
	return validateSlackConsultModel(
		(parsed as { model?: unknown }).model,
		`Slack model config ${configPath} field \"model\"`,
	);
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
