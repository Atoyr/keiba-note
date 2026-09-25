/**
 * 枠順を待っている重賞の出走馬の取得を、GitHub Actions に頼む。Cron（`scheduled.ts`）から毎時呼ばれる。
 *
 * 1. D1 から、枠順を待っているレースを選ぶ（`listEntriesFetchTargets`）
 * 2. 1レースずつ Actions を起動する。Actions は枠順が確定していなければ何も書かずに終える
 *
 * 取りに行く時刻の判断（確定したかどうか）は Actions 側の出馬表で決まる。ここは「まだ入っていない」
 * レースを毎時知らせるだけ。枠順の PR がマージされて馬番が入ると、対象から外れる。
 *
 * ログの出し方（通知するかどうか）は呼び出し側に渡す `log` が決める。ここは monitoring を知らない。
 */
import type { Db } from '$lib/server/db';
import { listEntriesFetchTargets } from '$lib/server/services/entries-fetch';
import { DispatchError, type DispatchErrorKind, type EntriesFetchRequest } from './dispatch';

export type EntriesLogEntry = {
	level: 'info' | 'warn' | 'error';
	event: string;
	message: string;
	/** 省略時は error だけ通知する（monitoring の既定）。 */
	notify?: boolean;
	dedupeKey?: string;
	/** 生のエラー。ログに出せる形にするのは呼び出し側（`describeError`）。 */
	error?: unknown;
	[field: string]: unknown;
};

export type RequestEntriesDeps = {
	db: Db;
	dispatch: (req: EntriesFetchRequest) => Promise<void>;
	log: (entry: EntriesLogEntry) => void;
	now?: () => Date;
};

export type RequestEntriesSummary = {
	targets: number;
	requested: number;
	failed: number;
	/** 設定・権限・制限のため、残りのレースを頼まずに終えた。 */
	stopped: boolean;
};

/** 1つ失敗したら残りも同じ理由で落ちるもの。その回はそこでやめる。 */
const STOP_KINDS: ReadonlySet<DispatchErrorKind | 'unknown'> = new Set([
	'not-configured',
	'auth',
	'rate-limited'
]);

export async function requestEntriesFetch(
	deps: RequestEntriesDeps
): Promise<RequestEntriesSummary> {
	const now = deps.now ?? (() => new Date());
	const targets = await listEntriesFetchTargets(deps.db, now());
	const summary: RequestEntriesSummary = {
		targets: targets.length,
		requested: 0,
		failed: 0,
		stopped: false
	};

	for (const t of targets) {
		const base = {
			event: 'entries.dispatch',
			raceId: t.raceId,
			race: `${t.date} ${t.course}${t.raceNumber}R`
		};
		try {
			await deps.dispatch({
				date: t.date,
				course: t.course,
				raceNumber: t.raceNumber,
				externalRef: t.externalRef,
				requireConfirmed: true,
				trigger: 'cron'
			});
			summary.requested++;
			deps.log({
				...base,
				level: 'info',
				message: '出走馬の取得を Actions に頼んだ',
				success: true
			});
		} catch (e) {
			const kind: DispatchErrorKind | 'unknown' = e instanceof DispatchError ? e.kind : 'unknown';
			summary.failed++;
			deps.log({
				...base,
				...LOG_BY_KIND[kind],
				dedupeKey: `entries.dispatch:${kind}`,
				success: false,
				errorType: kind,
				error: e
			});
			if (STOP_KINDS.has(kind)) {
				summary.stopped = true;
				break;
			}
		}
	}
	return summary;
}

/**
 * 失敗の種類ごとの重さ。**通知するのは人が手を入れる必要があるものだけ。**
 * 一時的に届かなかった1回では知らせない（1時間後の回でまた頼む）。
 */
const LOG_BY_KIND: Record<
	DispatchErrorKind | 'unknown',
	Pick<EntriesLogEntry, 'level' | 'message' | 'notify'>
> = {
	// シークレットを入れるまでは毎時これになる。重賞の週だけ数回なので、知らせて気づかせる
	'not-configured': {
		level: 'warn',
		message: 'GitHub のトークンが無いので、出走馬の取得を頼めない',
		notify: true
	},
	auth: { level: 'error', message: 'GitHub のトークンが通らない（期限切れか権限不足）' },
	'rate-limited': {
		level: 'warn',
		message: 'GitHub の API の制限に当たった。この回の残りは頼まない',
		notify: true
	},
	network: { level: 'warn', message: 'GitHub に届かなかった', notify: false },
	http: { level: 'error', message: 'GitHub が出走馬の取得を受け付けなかった' },
	unknown: { level: 'error', message: '出走馬の取得を頼めなかった' }
};
