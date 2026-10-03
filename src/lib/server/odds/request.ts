/**
 * オッズの更新を GitHub Actions（`.github/workflows/odds-update.yml`）に頼む。Cron（`scheduled.ts`）から30分おきに呼ばれる。
 *
 * 1. D1 から、いま取りに行く時間帯に入っているレースを選ぶ（`listOddsTargetIds`）
 * 2. 1つでもあれば、ワークフローを1回だけ起動する。どのレースを取るかは Actions がもう一度 D1 から選ぶ
 *
 * **Worker は取得元（netkeiba）へ行かず、D1 にも書かない。** 起動を Worker の Cron に任せているのは、
 * GitHub の schedule が混んでいると大半の回を飛ばすため（docs/architecture.md 3-8）。
 *
 * ログの出し方（通知するかどうか）は呼び出し側に渡す `log` が決める。ここは monitoring を知らない。
 */
import type { Db } from '$lib/server/db';
import { DispatchError, type DispatchErrorKind } from '$lib/server/race-data/dispatch';
import { listOddsTargetIds } from '$lib/server/services/odds';

export const ODDS_WORKFLOW = 'odds-update.yml';

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

export type RequestOddsDeps = {
	db: Db;
	/** `odds-update.yml` を起動する。 */
	dispatch: () => Promise<void>;
	log: (entry: OddsLogEntry) => void;
	now?: () => Date;
};

export type RequestOddsSummary = {
	targets: number;
	requested: boolean;
};

export async function requestOddsUpdate(deps: RequestOddsDeps): Promise<RequestOddsSummary> {
	const now = deps.now ?? (() => new Date());
	const raceIds = await listOddsTargetIds(deps.db, now());
	// 対象が無い回（ほとんどの回）は GitHub へ行かず、ログも出さない
	if (raceIds.length === 0) return { targets: 0, requested: false };

	const base = { event: 'odds.dispatch', raceIds };
	try {
		await deps.dispatch();
		deps.log({
			...base,
			level: 'info',
			message: 'オッズの更新を Actions に頼んだ',
			success: true
		});
		return { targets: raceIds.length, requested: true };
	} catch (e) {
		const kind: DispatchErrorKind | 'unknown' = e instanceof DispatchError ? e.kind : 'unknown';
		deps.log({
			...base,
			...LOG_BY_KIND[kind],
			dedupeKey: `odds.dispatch:${kind}`,
			success: false,
			errorType: kind,
			error: e
		});
		return { targets: raceIds.length, requested: false };
	}
}

/**
 * 失敗の種類ごとの重さ。**通知するのは人が手を入れる必要があるものだけ。**
 * 一時的に届かなかった1回では知らせない（30分後の回でまた頼む）。
 */
const LOG_BY_KIND: Record<
	DispatchErrorKind | 'unknown',
	Pick<OddsLogEntry, 'level' | 'message' | 'notify'>
> = {
	'not-configured': {
		level: 'warn',
		message: 'GitHub のトークンが無いので、オッズの更新を頼めない',
		notify: true
	},
	auth: { level: 'error', message: 'GitHub のトークンが通らない（期限切れか権限不足）' },
	'rate-limited': { level: 'warn', message: 'GitHub の API の制限に当たった', notify: true },
	network: { level: 'warn', message: 'GitHub に届かなかった', notify: false },
	http: { level: 'error', message: 'GitHub がオッズの更新を受け付けなかった' },
	unknown: { level: 'error', message: 'オッズの更新を頼めなかった' }
};
