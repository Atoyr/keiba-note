/**
 * 重賞の出走馬の取得を、GitHub Actions に頼む。Cron（`scheduled.ts`）が決まった時刻に、段ごとに呼ぶ。
 *
 * 段は3つ（`EntriesStage`）。日曜の `candidates`（候補が決まる）、木曜の `entries`（出走馬の発表）、
 * 金曜の `frames`（枠・馬番の発表）。
 *
 * 1. D1 から、その段の窓に入った重賞を選ぶ（`listEntriesFetchTargets`）
 * 2. 1レースずつ Actions を起動する。`frames` だけは枠順が確定していなければ何も書かずに終える
 *    （`requireConfirmed`）。`candidates`・`entries` は出馬表をそのまま書く
 *
 * 枠順の PR がマージされて馬番が入ると、対象から外れる。
 *
 * 結果（`requestResultsFetch`）も同じ経路で頼む。開催日の夕方に1回、当日のレースを選んで `command: result` で起動する。
 *
 * ログの出し方（通知するかどうか）は呼び出し側に渡す `log` が決める。ここは monitoring を知らない。
 */
import type { Db } from '$lib/server/db';
import {
	listEntriesFetchTargets,
	type EntriesFetchTarget,
	type EntriesStage
} from '$lib/server/services/entries-fetch';
import { listResultsFetchTargets } from '$lib/server/services/results-fetch';
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
	/** Cron の段。 */
	stage: EntriesStage;
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
	const { stage } = deps;
	const targets = await listEntriesFetchTargets(deps.db, now(), stage);
	const { summary } = await dispatchEach(deps, targets, {
		event: 'entries.dispatch',
		fields: { stage },
		request: (t) => ({ ...base(t), requireConfirmed: stage === 'frames', trigger: 'cron', stage }),
		label: '出走馬'
	});
	return summary;
}

export type RequestResultsDeps = Omit<RequestEntriesDeps, 'stage'>;

/**
 * 当日の結果の取得を、GitHub Actions に頼む。Cron（`scheduled.ts`）が開催日の夕方に1回だけ呼ぶ。
 *
 * 1日1回きりで、翌日に取り直す回は無い。**頼めなかったレースは、レースごとには通知せず、
 * 最後にまとめて1件で知らせる**（monitor は1回の起動で1件しか送らないので、レースごとに送ると
 * 2レース目からが届かない）。知らせを見た人が Actions を `command: result` で手で起動する。
 */
export async function requestResultsFetch(
	deps: RequestResultsDeps
): Promise<RequestEntriesSummary> {
	const now = deps.now ?? (() => new Date());
	const targets = await listResultsFetchTargets(deps.db, now());
	const { summary, missed } = await dispatchEach(deps, targets, {
		event: 'results.dispatch',
		fields: {},
		request: (t) => ({ ...base(t), requireConfirmed: false, trigger: 'cron', command: 'result' }),
		label: '結果',
		notifyEach: false
	});
	if (missed.length > 0) {
		deps.log({
			level: 'error',
			event: 'results.dispatch.missed',
			message:
				`結果の取得を頼めなかったレースがある（${missed.join('・')}）。` +
				'Actions の「出走馬・結果の取得」を command: result・開催日・場・R で手で起動する',
			races: missed,
			...summary
		});
	}
	return summary;
}

function base(t: EntriesFetchTarget) {
	return {
		date: t.date,
		course: t.course,
		raceNumber: t.raceNumber,
		externalRef: t.externalRef
	};
}

/**
 * 1レースずつ Actions を起動する。`STOP_KINDS` の失敗ではそこでやめる。
 * `missed` は頼めなかったレース（失敗したものと、やめたあとに残ったもの）。
 */
async function dispatchEach(
	deps: Pick<RequestEntriesDeps, 'dispatch' | 'log'>,
	targets: EntriesFetchTarget[],
	opts: {
		event: string;
		fields: Record<string, unknown>;
		request: (t: EntriesFetchTarget) => EntriesFetchRequest;
		/** ログの文の「出走馬」を置き換える語。 */
		label: string;
		/** false ならレースごとの失敗を通知しない（呼び出し側がまとめて知らせる）。 */
		notifyEach?: boolean;
	}
): Promise<{ summary: RequestEntriesSummary; missed: string[] }> {
	const summary: RequestEntriesSummary = {
		targets: targets.length,
		requested: 0,
		failed: 0,
		stopped: false
	};
	const missed: string[] = [];
	const name = (t: EntriesFetchTarget) => `${t.date} ${t.course}${t.raceNumber}R`;

	for (const [i, t] of targets.entries()) {
		const logBase = { event: opts.event, ...opts.fields, raceId: t.raceId, race: name(t) };
		try {
			await deps.dispatch(opts.request(t));
			summary.requested++;
			deps.log({
				...logBase,
				level: 'info',
				message: `${opts.label}の取得を Actions に頼んだ`,
				success: true
			});
		} catch (e) {
			const kind: DispatchErrorKind | 'unknown' = e instanceof DispatchError ? e.kind : 'unknown';
			summary.failed++;
			missed.push(name(t));
			const { message, ...weight } = LOG_BY_KIND[kind];
			deps.log({
				...logBase,
				...weight,
				message: message.replace('出走馬', opts.label),
				...(opts.notifyEach === false ? { notify: false } : {}),
				dedupeKey: `${opts.event}:${kind}`,
				success: false,
				errorType: kind,
				error: e
			});
			if (STOP_KINDS.has(kind)) {
				summary.stopped = true;
				missed.push(...targets.slice(i + 1).map(name));
				break;
			}
		}
	}
	return { summary, missed };
}

/**
 * 失敗の種類ごとの重さ。**通知するのは人が手を入れる必要があるものだけ。**
 * 各段1回きりなので、届かなかった回も知らせて管理画面から取り直させる。
 */
const LOG_BY_KIND: Record<
	DispatchErrorKind | 'unknown',
	Pick<EntriesLogEntry, 'level' | 'message' | 'notify'>
> = {
	// シークレットを入れるまでは Cron の回ごとにこれになる。重賞の週だけ週に数回なので、知らせて気づかせる
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
	network: { level: 'warn', message: 'GitHub に届かなかった', notify: true },
	http: { level: 'error', message: 'GitHub が出走馬の取得を受け付けなかった' },
	unknown: { level: 'error', message: '出走馬の取得を頼めなかった' }
};
