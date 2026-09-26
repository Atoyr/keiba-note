/**
 * オッズの正規化した形と、取得元（provider）の約束。
 *
 * **取得元に固有のことはここに持ち込まない。** netkeiba の JSON の形・URL・status の名前は
 * `scripts/odds/netkeiba/` の中に閉じ、D1・予想画面・更新の手順（`scripts/odds/update.ts`）はこのファイルの型だけを見る。
 * 取得元を替えるときは provider を1つ書き足し、`scripts/odds-update.ts` で渡すものを替えるだけで済む。
 *
 * 取得は GitHub Actions がし（`scripts/odds/`）、Worker は予想画面で読むだけ。型と検査を両方から使うのでここに置く。
 * `scripts/` からは Node で直接読むので、ここは何も import しない。
 */

export type HorseOdds = {
	horseNumber: number;
	winOdds: number | null;
	placeOddsMin: number | null;
	placeOddsMax: number | null;
};

export type RaceOdds = {
	/** アプリのレース ID（`race.id`）。取得元の ID ではない。 */
	raceId: string;
	/** オッズの時点（ISO 8601）。取得元が時刻を返さなければ取得した時刻。画面の「14:30時点」はこれ。 */
	asOf: string;
	/** 取りに行った時刻（ISO 8601）。 */
	fetchedAt: string;
	horses: HorseOdds[];
};

export interface OddsProvider {
	/** ログに出す名前。`netkeiba` など。 */
	readonly name: string;
	/**
	 * @param externalRaceId `race.external_ref` そのもの（`nk-202606040911` など）。
	 *   読み方は provider が決める。読めない形なら `unsupported-ref` で投げる。
	 */
	getRaceOdds(input: { raceId: string; externalRaceId: string }): Promise<RaceOdds>;
}

/**
 * 取得の失敗の種類。**再試行するか・通知するかはこの種類だけで決める**（`update.ts`）。
 *
 * - `unsupported-ref` … `external_ref` がこの provider の形でない
 * - `network` … 届かなかった・時間切れ・5xx。1回だけ再試行する
 * - `http` … 5xx 以外の失敗。再試行しない
 * - `rate-limited` … 429 か、取得元が制限中と答えた。**再試行せず、その回の残りも取りに行かない**
 * - `not-available` … 発売前でまだ無い。失敗ではない
 * - `parse` … 返ってきた形が想定と違う。取得元の構造が変わった疑い
 * - `invalid` … 形は読めたが値がおかしい（0以下・下限 > 上限・馬番の重複など）
 */
export type OddsErrorKind =
	'unsupported-ref' | 'network' | 'http' | 'rate-limited' | 'not-available' | 'parse' | 'invalid';

/**
 * 取得元の応答の、原因を調べるための抜き書き。HTTP で失敗したときだけ付く。
 * **送ったリクエストの中身（ヘッダなど）は入れない。** 受け取ったものだけ。
 */
export type OddsResponseSummary = {
	status: number;
	/** 手前の CDN・WAF のどれが返したかを見分けるためのヘッダ（`server`・`x-cache`・`via` など）。 */
	headers: Record<string, string>;
	/** 本文の先頭。拒否の理由が書かれていることがある。 */
	body: string;
};

export class OddsError extends Error {
	override readonly name = 'OddsError';
	// Node の型の除去（--experimental-strip-types）は引数プロパティを読めないので、欄は別に宣言する
	readonly kind: OddsErrorKind;
	readonly response?: OddsResponseSummary;
	constructor(
		kind: OddsErrorKind,
		message: string,
		options?: { cause?: unknown; response?: OddsResponseSummary }
	) {
		super(message, options);
		this.kind = kind;
		this.response = options?.response;
	}
}

const MAX_HORSE_NUMBER = 18;

/**
 * 保存してよい値か。**壊れた値で前回の正常な値を上書きしない**ための最後の関門。
 * 1頭でもおかしければレースごと保存しない（部分的に古い値と混ざるのを避ける）。
 */
export function validateRaceOdds(odds: RaceOdds): void {
	if (odds.horses.length === 0) throw new OddsError('invalid', '馬が1頭もいません');
	// 取消の馬は値なしで来るが、全頭が値なしなら発売中の応答としておかしい（欄の形が変わった疑い）。
	// 通すと前回の正常な値を全頭 `-` で上書きしてしまう。
	if (odds.horses.every((h) => h.winOdds === null)) {
		throw new OddsError('invalid', '単勝が1頭も取れていません');
	}
	if (Number.isNaN(Date.parse(odds.asOf))) {
		throw new OddsError('invalid', `時点が日時として読めません: ${odds.asOf}`);
	}

	const seen = new Set<number>();
	for (const h of odds.horses) {
		const n = h.horseNumber;
		if (!Number.isInteger(n) || n < 1 || n > MAX_HORSE_NUMBER) {
			throw new OddsError('invalid', `馬番が 1〜${MAX_HORSE_NUMBER} ではありません: ${n}`);
		}
		if (seen.has(n)) throw new OddsError('invalid', `馬番 ${n} が2回あります`);
		seen.add(n);

		for (const [label, value] of [
			['単勝', h.winOdds],
			['複勝の下限', h.placeOddsMin],
			['複勝の上限', h.placeOddsMax]
		] as const) {
			if (value !== null && !(Number.isFinite(value) && value > 0)) {
				throw new OddsError('invalid', `${n}番の${label}が正の数ではありません: ${value}`);
			}
		}
		if ((h.placeOddsMin === null) !== (h.placeOddsMax === null)) {
			throw new OddsError('invalid', `${n}番の複勝が下限か上限の片方だけです`);
		}
		if (h.placeOddsMin !== null && h.placeOddsMax !== null && h.placeOddsMin > h.placeOddsMax) {
			throw new OddsError(
				'invalid',
				`${n}番の複勝の下限が上限より大きい: ${h.placeOddsMin} > ${h.placeOddsMax}`
			);
		}
	}
}
