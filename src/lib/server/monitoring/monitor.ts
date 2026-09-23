/**
 * リクエストごとの監視の口。`hooks.server.ts` が作って `locals.monitor` に載せる。
 *
 * - `log` … 構造化ログを Workers Logs に出し、通知の対象なら Discord へ送る
 * - `onQuery` … `createDb` に渡す。D1 の失敗と遅いクエリをログにする
 *
 * 通知の対象は、既定で `error` だけ。`warn` は `notify: true` を付けたものだけ送る
 * （対応が要る WARN に限る。→ docs/monitoring.md）。送信は `waitUntil` に載せ、応答を待たせない。
 */
import { isCheckViolation, isUniqueViolation } from '$lib/server/db/errors';
import type { QueryObserver, QueryReport } from '$lib/server/db';
import { postDiscord, toDiscordPayload } from './discord';
import { describeError, writeLog, type LogEntry } from './log';
import { AlertThrottle } from './throttle';

/** 遅いクエリとみなす時間。仮置き。実測（Workers Logs の d1.query.slow）を見て直す。 */
export const SLOW_QUERY_MS = 500;
/** 同じ通知を抑える時間。 */
export const ALERT_WINDOW_MS = 5 * 60_000;

/**
 * isolate の中で使い回す連投抑制。**モジュールスコープに置く唯一の状態**で、
 * 持つのは event 名と時刻・件数だけ（ユーザーの情報も接続も持たない）。
 */
const isolateThrottle = new AlertThrottle(ALERT_WINDOW_MS);

/** `requestId` は monitor が埋める（渡しても上書きする）。 */
export type LogInput = LogEntry & {
	/** 省略時は level が error なら通知する。 */
	notify?: boolean;
	/** 連投抑制の鍵。省略時は `level:event`。 */
	dedupeKey?: string;
};

export type Monitor = {
	requestId: string;
	log: (entry: LogInput) => void;
	onQuery: QueryObserver;
};

export type MonitorOptions = {
	requestId: string;
	/** `production` / `staging` / `local` など。通知に出す。 */
	environment: string;
	/** 無ければ通知しない（ローカル・E2E）。ログには出す。 */
	webhookUrl?: string;
	waitUntil?: (task: Promise<unknown>) => void;
	throttle?: AlertThrottle;
	fetchFn?: typeof fetch;
	slowQueryMs?: number;
};

/** 通知の補足欄に出す項目。ここに無いものはログにだけ出る。 */
const DETAIL_KEYS = ['method', 'route', 'status', 'sql', 'kind', 'oauthError'] as const;

export function createMonitor(options: MonitorOptions): Monitor {
	const { requestId, environment, webhookUrl } = options;
	const throttle = options.throttle ?? isolateThrottle;
	const slowQueryMs = options.slowQueryMs ?? SLOW_QUERY_MS;
	/**
	 * 1リクエストで通知は1件まで。D1 が落ちると `d1.query.failed` のあとに同じ原因の
	 * `request.unhandled` が続くので、先に来た（原因に近い）ほうだけを送る。ログには両方出る。
	 */
	let notified = false;

	function log({ notify, dedupeKey, ...entry }: LogInput): void {
		writeLog({ ...entry, requestId });

		const level = entry.level;
		if (level === 'info' || !(notify ?? level === 'error') || !webhookUrl || notified) return;

		const gate = throttle.take(dedupeKey ?? `${level}:${entry.event}`);
		if (!gate.send) return;
		notified = true;

		const details: Record<string, string | number> = {};
		for (const key of DETAIL_KEYS) {
			const value = entry[key];
			if (typeof value === 'string' || typeof value === 'number') details[key] = value;
		}

		const task = postDiscord(
			webhookUrl,
			toDiscordPayload({
				level,
				event: entry.event,
				message: entry.message,
				environment,
				requestId,
				durationMs: entry.durationMs,
				error: entry.error ? { ...entry.error, stack: undefined } : undefined,
				details,
				suppressed: gate.suppressed
			}),
			options.fetchFn
		);
		if (options.waitUntil) options.waitUntil(task);
		else void task;
	}

	return {
		requestId,
		log,
		onQuery: (report) => {
			const entry = classifyQuery(report, slowQueryMs);
			if (entry) log(entry);
		}
	};
}

/** SQL は長くなりうる（batch）。ログにも通知にも頭だけ出す。値は元から入っていない。 */
function sqlHead(sql: string): string {
	return sql.length > 300 ? `${sql.slice(0, 300)}…` : sql;
}

/**
 * D1 のクエリをログの形に振り分ける。何も出さないなら null。
 *
 * - 失敗 … `d1.query.failed`（error・通知する）
 * - UNIQUE / CHECK 制約違反 … `d1.query.constraint`（warn・通知しない）。
 *   ルートが 409 などに振り替える想定の失敗で、利用者の操作で普通に起きる。
 *   振り替えずに落ちれば、500 として `request.unhandled` のほうで通知される
 * - 遅い … `d1.query.slow`（warn・通知しない。閾値は実測を見て決める）
 */
export function classifyQuery(report: QueryReport, slowQueryMs: number): LogInput | null {
	const base = {
		sql: sqlHead(report.sql),
		kind: report.kind,
		durationMs: Math.round(report.durationMs)
	};

	if (report.error !== undefined) {
		const error = describeError(report.error);
		if (isUniqueViolation(report.error) || isCheckViolation(report.error)) {
			return {
				level: 'warn',
				event: 'd1.query.constraint',
				message: 'D1 の制約違反',
				...base,
				error
			};
		}
		return {
			level: 'error',
			event: 'd1.query.failed',
			message: 'D1 のクエリが失敗した',
			...base,
			error
		};
	}

	if (report.durationMs >= slowQueryMs) {
		return {
			level: 'warn',
			event: 'd1.query.slow',
			message: `D1 のクエリに ${base.durationMs}ms かかった（閾値 ${slowQueryMs}ms）`,
			...base
		};
	}

	return null;
}
