import { GRADES } from '$lib/schemas/race';

/**
 * レース一覧の絞り込み条件。クエリ文字列と DB の条件の間に挟む。
 *
 * URL の値をそのままサービス層へ渡さず、ここで一度正規化する。
 * 画面（フォームの選択状態）とサーバー（WHERE）が同じ値を見るようになり、
 * 「チェックしたのに絞られない」というずれが起きない。
 */

export type Grade = (typeof GRADES)[number];

export type RaceFilter = {
	/** 開催年。`null` は全期間。 */
	year: number | null;
	/** 格付け。複数選べて **OR**（どれかに当たれば出る）。空なら絞らない。 */
	grades: Grade[];
	/** レース名の部分一致。空文字なら絞らない。 */
	q: string;
};

export const EMPTY_RACE_FILTER: RaceFilter = { year: null, grades: [], q: '' };

/** `YYYY` の4桁だけ受ける。壊れた値は「全期間」に落として一覧ごと落とさない。 */
function parseYear(raw: string | null): number | null {
	return raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/**
 * クエリ文字列 → 絞り込み条件。
 *
 * `grade` は複数値。`GRADES` 側を回して拾うので、**重複と未知の値が落ち、
 * 並びは常に G1→OP** になる。URL を手で書き換えられても選択肢の外には出ない。
 */
export function parseRaceFilter(params: URLSearchParams): RaceFilter {
	const grades = params.getAll('grade');
	return {
		year: parseYear(params.get('year')),
		grades: GRADES.filter((g) => grades.includes(g)),
		q: params.get('q')?.trim() ?? ''
	};
}

/** 何か1つでも絞っているか。「条件に合うものがありません」の出し分けに使う。 */
export function hasRaceFilter(filter: RaceFilter): boolean {
	return filter.year !== null || filter.grades.length > 0 || filter.q !== '';
}

/**
 * その年の日付の範囲（両端を含む）。
 *
 * JRA の年度は暦年と同じ区切りなので 1/1〜12/31。`date` は `YYYY-MM-DD` の
 * 文字列比較で並ぶため、この2つを両端にすれば `race_date` の索引に乗る。
 */
export function yearRange(year: number): { from: string; to: string } {
	return { from: `${year}-01-01`, to: `${year}-12-31` };
}
