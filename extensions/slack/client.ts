const SLACK_API_BASE = "https://slack.com/api/";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const READ_ONLY_METHODS = {
	"assistant.search.context": "POST",
	"conversations.history": "GET",
	"conversations.replies": "GET",
} as const;

type SlackMethod = keyof typeof READ_ONLY_METHODS;
type SlackHttpMethod = (typeof READ_ONLY_METHODS)[SlackMethod];
type FetchLike = typeof fetch;

type QueryValue = string | number | boolean | undefined;

interface SlackApiEnvelope {
	ok?: boolean;
	error?: string;
	needed?: string;
	provided?: string;
}

export interface SlackContextMessage {
	text?: string;
	user_id?: string;
	author_name?: string;
	ts?: string;
}

export interface SlackSearchMessage {
	author_name?: string;
	author_user_id?: string;
	team_id?: string;
	channel_id?: string;
	channel_name?: string;
	message_ts?: string;
	thread_ts?: string;
	content?: string;
	is_author_bot?: boolean;
	permalink?: string;
	context_messages?: {
		before?: SlackContextMessage[];
		after?: SlackContextMessage[];
	};
}

export interface SlackMessage {
	type?: string;
	subtype?: string;
	user?: string;
	username?: string;
	text?: string;
	ts?: string;
	thread_ts?: string;
	bot_profile?: {
		name?: string;
	};
}

export interface SlackSearchResponse extends SlackApiEnvelope {
	results?: {
		messages?: SlackSearchMessage[];
	};
	response_metadata?: {
		next_cursor?: string;
	};
}

export interface SlackConversationResponse extends SlackApiEnvelope {
	messages?: SlackMessage[];
	has_more?: boolean;
	response_metadata?: {
		next_cursor?: string;
	};
}

export interface SlackSearchRequest {
	query: string;
	channel_types?: string[];
	content_types: ["messages"];
	include_context_messages: true;
	limit: number;
	cursor?: string;
}

export interface SlackConversationRequest {
	channel: string;
	limit: number;
	cursor?: string;
}

export interface SlackThreadRequest extends SlackConversationRequest {
	ts: string;
}

export class SlackApiError extends Error {
	constructor(
		message: string,
		readonly method: SlackMethod,
		readonly code?: string,
		readonly retryAfterSeconds?: number,
	) {
		super(message);
		this.name = "SlackApiError";
	}
}

async function readBoundedText(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
		throw new Error("Slack API response exceeded the 8MB safety limit.");
	}

	if (!response.body) return response.text();

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw new Error("Slack API response exceeded the 8MB safety limit.");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function parseRetryAfter(response: Response): number | undefined {
	const header = response.headers.get("retry-after");
	if (header === null || header.trim() === "") return undefined;
	const value = Number(header);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function buildQueryUrl(method: SlackMethod, query: Record<string, QueryValue>): URL {
	const url = new URL(method, SLACK_API_BASE);
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === "") continue;
		url.searchParams.set(key, String(value));
	}
	return url;
}

export class SlackClient {
	constructor(
		private readonly token: string,
		private readonly fetchImpl: FetchLike = fetch,
	) {}

	searchMessages(request: SlackSearchRequest, signal?: AbortSignal): Promise<SlackSearchResponse> {
		return this.request("assistant.search.context", request, signal);
	}

	readHistory(request: SlackConversationRequest, signal?: AbortSignal): Promise<SlackConversationResponse> {
		return this.request("conversations.history", request, signal);
	}

	readThread(request: SlackThreadRequest, signal?: AbortSignal): Promise<SlackConversationResponse> {
		return this.request("conversations.replies", request, signal);
	}

	private async request<T extends SlackApiEnvelope>(
		method: SlackMethod,
		params: object,
		signal?: AbortSignal,
	): Promise<T> {
		const httpMethod = READ_ONLY_METHODS[method] as SlackHttpMethod | undefined;
		if (!httpMethod) {
			throw new Error(`Slack API method is not allowed: ${method}`);
		}

		const url = httpMethod === "GET"
			? buildQueryUrl(method, params as Record<string, QueryValue>)
			: new URL(method, SLACK_API_BASE);
		const response = await this.fetchImpl(url, {
			method: httpMethod,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: "application/json",
				...(httpMethod === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
			},
			body: httpMethod === "POST" ? JSON.stringify(params) : undefined,
			signal,
		});

		const retryAfter = parseRetryAfter(response);
		if (response.status === 429) {
			await response.body?.cancel().catch(() => {});
			const suffix = retryAfter === undefined ? "" : ` Retry after ${retryAfter} seconds.`;
			throw new SlackApiError(
				`Slack API ${method} was rate limited.${suffix}`,
				method,
				"ratelimited",
				retryAfter,
			);
		}

		const text = await readBoundedText(response);
		if (!response.ok) {
			throw new SlackApiError(
				`Slack API ${method} returned HTTP ${response.status}.`,
				method,
				`http_${response.status}`,
			);
		}

		let data: T;
		try {
			data = JSON.parse(text) as T;
		} catch {
			throw new SlackApiError(
				`Slack API ${method} returned invalid JSON.`,
				method,
				"invalid_json",
			);
		}

		if (data.ok !== true) {
			const code = data.error || "unknown_error";
			const scope = data.needed ? ` Required scope: ${data.needed}.` : "";
			throw new SlackApiError(
				`Slack API ${method} failed: ${code}.${scope}`,
				method,
				code,
				retryAfter,
			);
		}
		return data;
	}
}
