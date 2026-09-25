/**
 * netkeiba から単勝・複勝を取ってくる provider。読み替えは `parser.ts` に任せる。
 *
 * 取り方の約束（docs/architecture.md 3-8）:
 * - 1回の呼び出しで1リクエストだけ。再試行・間隔の制御は呼び出し側（`update.ts`）が持つ
 * - 制限を避けるための細工（プロキシ・IP の切り替え・ヘッダの偽装）はしない。
 *   User-Agent は `data:fetch`（scripts/race-data/netkeiba.ts）と同じく用途を名乗る
 */
import { OddsError, type OddsProvider, type OddsResponseSummary, type RaceOdds } from '../odds';
import { parseNetkeibaOdds } from './parser';

const USER_AGENT = 'Mozilla/5.0 (uma-memo odds; personal use)';
const DEFAULT_TIMEOUT_MS = 10_000;

/** `race.external_ref` の netkeiba の形。馬の ref（`nk-2022103875`）と同じ接頭辞。 */
const REF = /^nk-(\d{12})$/;

export function netkeibaRaceId(externalRef: string): string | null {
	return REF.exec(externalRef)?.[1] ?? null;
}

export function oddsUrl(netkeibaRaceId: string): string {
	return `https://race.netkeiba.com/api/api_get_jra_odds.html?race_id=${netkeibaRaceId}&type=1&action=init&compress=0`;
}

export type NetkeibaOptions = {
	fetchFn?: typeof fetch;
	timeoutMs?: number;
	now?: () => Date;
};

export class NetkeibaOddsProvider implements OddsProvider {
	readonly name = 'netkeiba';
	readonly #fetch: typeof fetch;
	readonly #timeoutMs: number;
	readonly #now: () => Date;

	constructor(options: NetkeibaOptions = {}) {
		// Workers の fetch は this を失うと投げるので、そのまま渡さず包む。
		this.#fetch = options.fetchFn ?? ((input, init) => fetch(input, init));
		this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.#now = options.now ?? (() => new Date());
	}

	async getRaceOdds({
		raceId,
		externalRaceId
	}: {
		raceId: string;
		externalRaceId: string;
	}): Promise<RaceOdds> {
		const id = netkeibaRaceId(externalRaceId);
		if (!id)
			throw new OddsError(
				'unsupported-ref',
				`netkeiba の race_id ではありません: ${externalRaceId}`
			);

		const fetchedAt = this.#now();
		let res: Response;
		try {
			res = await this.#fetch(oddsUrl(id), {
				headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
				signal: AbortSignal.timeout(this.#timeoutMs)
			});
		} catch (e) {
			throw new OddsError('network', '取得元に届きませんでした', { cause: e });
		}

		if (!res.ok) {
			const kind = res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'network' : 'http';
			throw new OddsError(kind, `取得元が ${res.status} を返しました`, {
				response: await summarize(res)
			});
		}

		let body: unknown;
		try {
			body = await res.json();
		} catch (e) {
			throw new OddsError('parse', '応答が JSON ではありません', { cause: e });
		}
		return parseNetkeibaOdds(body, raceId, fetchedAt);
	}
}

/** 見分けに使うヘッダ。CloudFront（netkeiba の手前）のものと、拒否の理由が載りうるもの。 */
const SUMMARY_HEADERS = [
	'content-type',
	'server',
	'x-cache',
	'via',
	'x-amz-cf-pop',
	'x-amz-cf-id',
	'x-amzn-errortype',
	'x-amzn-waf-action',
	'retry-after'
];
const BODY_HEAD = 300;

/**
 * 失敗した応答の抜き書き。Workers からだけ 400 が返る（手元からは 200）ことがあり、
 * 手前の CloudFront が返したのか、奥の Apache が返したのかを見分けるのに使う（docs/monitoring.md 第3章）。
 */
async function summarize(res: Response): Promise<OddsResponseSummary> {
	const headers: Record<string, string> = {};
	for (const name of SUMMARY_HEADERS) {
		const value = res.headers.get(name);
		if (value !== null) headers[name] = value;
	}
	let body = '';
	try {
		body = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, BODY_HEAD);
	} catch {
		// 本文が読めなくても、ステータスとヘッダだけで出す
	}
	return { status: res.status, headers, body };
}
