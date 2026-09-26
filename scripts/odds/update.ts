/**
 * オッズの更新。GitHub Actions（`odds-update.yml` → `scripts/odds-update.ts`）から30分おきに呼ばれる。
 *
 * 1. D1 から、いま取りに行ってよいレースを選ぶ（`store.listTargets`。ref・発走時刻がある重賞で、格で決まる時間帯に入ったもの）
 * 2. **1レースずつ順に**取りに行く。並列にしない。レースの間は間を空ける
 * 3. 検査を通ったものだけを保存する。**失敗した回は何も書かない**（前回の値と時点が残る）
 *
 * 再試行は、届かなかった・5xx のときに1回だけ。取得元が制限をかけてきたら、その回の残りのレースも
 * 取りに行かずに終える。制限を避けるための細工はしない。
 *
 * ログの出し方（通知するかどうか）は呼び出し側に渡す `log` が決める。ここは monitoring を知らない。
 */
import {
	OddsError,
	validateRaceOdds,
	type OddsErrorKind,
	type OddsProvider,
	type RaceOdds
} from '../../src/lib/server/odds/odds.ts';

export type OddsTarget = { raceId: string; externalRef: string };

/** 対象の選び方と保存先。本番は `wrangler d1 execute --remote`（`scripts/odds-update.ts`）、テストは node:sqlite。 */
export type OddsStore = {
	/** いま取りに行ってよいレース（`store.ts` の `targetsSql` → `pickTargets`）。 */
	listTargets: (now: Date) => Promise<OddsTarget[]>;
	/** 検査を通ったものを、そのレースの行と置き換える（`store.ts` の `saveOddsSql`）。 */
	save: (odds: RaceOdds) => Promise<void>;
};

export type OddsLogEntry = {
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

export type UpdateOddsDeps = {
	store: OddsStore;
	provider: OddsProvider;
	log: (entry: OddsLogEntry) => void;
	now?: () => Date;
	sleep?: (ms: number) => Promise<void>;
	/** 失敗から再試行までの間。 */
	retryDelayMs?: number;
	/** レースとレースの間。 */
	intervalMs?: number;
};

export type UpdateOddsSummary = {
	targets: number;
	saved: number;
	/** 発売前などで、取れるものがまだ無かった。 */
	notAvailable: number;
	failed: number;
	/** 取得元の制限で、残りのレースを取りに行かずに終えた。 */
	stopped: boolean;
};

type Outcome = 'saved' | 'not-available' | 'failed' | 'rate-limited';

const RETRY_DELAY_MS = 3_000;
const INTERVAL_MS = 1_000;

export async function updateOdds(deps: UpdateOddsDeps): Promise<UpdateOddsSummary> {
	const now = deps.now ?? (() => new Date());
	const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
	const summary: UpdateOddsSummary = {
		targets: 0,
		saved: 0,
		notAvailable: 0,
		failed: 0,
		stopped: false
	};

	const targets = await deps.store.listTargets(now());
	summary.targets = targets.length;

	for (const [i, target] of targets.entries()) {
		if (i > 0) await sleep(deps.intervalMs ?? INTERVAL_MS);
		const outcome = await updateOne({ ...deps, now, sleep }, target);
		if (outcome === 'saved') summary.saved++;
		else if (outcome === 'not-available') summary.notAvailable++;
		else summary.failed++;
		if (outcome === 'rate-limited') {
			summary.stopped = true;
			break;
		}
	}
	return summary;
}

async function updateOne(
	deps: UpdateOddsDeps & { now: () => Date; sleep: (ms: number) => Promise<void> },
	target: OddsTarget
): Promise<Outcome> {
	const { provider, now } = deps;
	const startedAt = now();
	const base = {
		event: 'odds.fetch',
		provider: provider.name,
		raceId: target.raceId,
		externalRaceId: target.externalRef,
		startedAt: startedAt.toISOString()
	};
	const finish = () => {
		const finishedAt = now();
		return {
			finishedAt: finishedAt.toISOString(),
			durationMs: finishedAt.getTime() - startedAt.getTime()
		};
	};

	try {
		const input = { raceId: target.raceId, externalRaceId: target.externalRef };
		let odds;
		try {
			odds = await provider.getRaceOdds(input);
		} catch (e) {
			if (!(e instanceof OddsError && e.kind === 'network')) throw e;
			await deps.sleep(deps.retryDelayMs ?? RETRY_DELAY_MS);
			odds = await provider.getRaceOdds(input);
		}
		validateRaceOdds(odds);
		await deps.store.save(odds);

		deps.log({
			...base,
			...finish(),
			level: 'info',
			message: 'オッズを更新した',
			success: true,
			horseCount: odds.horses.length
		});
		return 'saved';
	} catch (e) {
		const kind: OddsErrorKind | 'unknown' = e instanceof OddsError ? e.kind : 'unknown';
		deps.log({
			...base,
			...finish(),
			...LOG_BY_KIND[kind],
			dedupeKey: `odds.fetch:${kind}`,
			success: false,
			errorType: kind,
			// HTTP で失敗したときの応答の抜き書き（ステータス・ヘッダ・本文の先頭）。原因を調べるのに使う
			...(e instanceof OddsError && e.response ? { response: e.response } : {}),
			error: e
		});
		if (kind === 'not-available') return 'not-available';
		if (kind === 'rate-limited') return 'rate-limited';
		return 'failed';
	}
}

/**
 * 失敗の種類ごとの重さ。**通知するのは人が手を入れる必要があるものだけ。**
 * 一時的に届かなかった1回では知らせない（次の回で取れる）。
 */
const LOG_BY_KIND: Record<
	OddsErrorKind | 'unknown',
	Pick<OddsLogEntry, 'level' | 'message' | 'notify'>
> = {
	'not-available': { level: 'info', message: 'オッズがまだ出ていない' },
	network: { level: 'warn', message: 'オッズを取れなかった（再試行も失敗）', notify: false },
	http: { level: 'warn', message: 'オッズを取れなかった', notify: false },
	'rate-limited': {
		level: 'warn',
		message: '取得元に制限された。この回の残りは取りに行かない',
		notify: true
	},
	'unsupported-ref': {
		level: 'warn',
		message: 'レースの external_ref を取得元が読めない',
		notify: true
	},
	// 取得元の構造が変わった疑い。直すまで毎回落ちるので知らせる
	parse: { level: 'error', message: 'オッズの応答が想定と違う形だった' },
	invalid: { level: 'error', message: 'オッズの値がおかしいので保存しなかった' },
	unknown: { level: 'error', message: 'オッズの更新に失敗した' }
};
