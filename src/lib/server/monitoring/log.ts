/**
 * 構造化ログ。Workers Logs（Observability）はオブジェクトを渡すと項目ごとに検索できる。
 *
 * **出さないもの:** パスワード・トークン・Cookie・Authorization ヘッダ・Webhook の URL・
 * メモの本文。Drizzle のエラーはバインドした値（メモの本文など）をメッセージに載せるので、
 * `describeError` で落としてから出す。
 */

export type Level = 'info' | 'warn' | 'error';

export type ErrorSummary = {
	name: string;
	message: string;
	/** cause を辿ったメッセージ。D1 の本当の理由（`D1_ERROR: ...`）はここに出る。 */
	causes?: string[];
	stack?: string;
};

export type LogEntry = {
	level: Level;
	/** `d1.query.failed` のような、ドットでつないだ英小文字の名前。検索と通知の抑制に使う。 */
	event: string;
	message: string;
	requestId?: string;
	durationMs?: number;
	error?: ErrorSummary;
	[field: string]: unknown;
};

export function writeLog(entry: LogEntry): void {
	if (entry.level === 'error') console.error(entry);
	else if (entry.level === 'warn') console.warn(entry);
	else console.log(entry);
}

const MAX_MESSAGE = 500;
const MAX_STACK_LINES = 8;

/**
 * Drizzle の `Failed query: <sql>\nparams: <値>` から値を落とす。
 * 値は改行を含みうる（メモの本文）ので、`params:` から先（stack ならその次の `at` まで）を消す。
 */
function redactParams(text: string): string {
	return text.replace(/\nparams: [\s\S]*?(?=\n\s+at |$)/, '\nparams: [redacted]');
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** ログと通知に出してよい形にエラーを要約する。 */
export function describeError(e: unknown): ErrorSummary {
	if (!(e instanceof Error)) {
		return { name: typeof e, message: truncate(redactParams(String(e)), MAX_MESSAGE) };
	}

	const causes: string[] = [];
	let cause: unknown = e.cause;
	for (let depth = 0; cause !== undefined && cause !== null && depth < 5; depth++) {
		const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
		causes.push(truncate(redactParams(text), MAX_MESSAGE));
		cause = cause instanceof Error ? cause.cause : undefined;
	}

	const stack = e.stack
		? redactParams(e.stack).split('\n').slice(0, MAX_STACK_LINES).join('\n')
		: undefined;

	return {
		name: e.name,
		message: truncate(redactParams(e.message), MAX_MESSAGE),
		...(causes.length > 0 ? { causes } : {}),
		...(stack ? { stack } : {})
	};
}
