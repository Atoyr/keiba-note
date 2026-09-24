import { GRADED, GRADES } from '$lib/schemas/race';

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

/** 絞り込みのクエリのキー。どれか1つでも URL にあれば「条件を指定して開いた」とみなす。 */
const FILTER_KEYS = ['year', 'grade', 'q'] as const;

/**
 * 何も指定せずに開いたときの条件。**今年の重賞（G1〜G3）**。
 *
 * 一覧は日付降順なので、絞らないと条件戦と、枠だけ先に登録した先の重賞が上を埋める。
 * 探しに来るのはほとんどが今年の重賞なので、そこから始める。
 * 年は JST の今日から取る（年度の区切りは暦年 → `yearRange`）。
 */
export function defaultRaceFilter(today: string): RaceFilter {
	return { year: Number(today.slice(0, 4)), grades: [...GRADED], q: '' };
}

/**
 * 条件を外した一覧（全期間・全ランク）へのクエリ。
 *
 * `/races` だけだと既定の絞り込み（`defaultRaceFilter`）に戻るので、
 * `year` を空で付けて「全期間を選んだ」ことを URL に残す。フォームで
 * 「すべて」を選んで送ったときと同じ形になる。
 */
export const ALL_RACES_QUERY = '?year=';

/** `YYYY` の4桁だけ受ける。壊れた値は「全期間」に落として一覧ごと落とさない。 */
function parseYear(raw: string | null): number | null {
	return raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/**
 * クエリ文字列 → 絞り込み条件。
 *
 * **絞り込みのキーが1つも無ければ既定（今年の重賞 → `defaultRaceFilter`）。**
 * フォームは年度の `<select>` を必ず送るので、フォームから来た URL は `year=` を持つ。
 * 「すべて」を選んでランクを外して送れば、全件になる。
 *
 * `grade` は複数値。`GRADES` 側を回して拾うので、**重複と未知の値が落ち、
 * 並びは常に G1→OP** になる。URL を手で書き換えられても選択肢の外には出ない。
 */
export function parseRaceFilter(params: URLSearchParams, today: string): RaceFilter {
	if (!FILTER_KEYS.some((key) => params.has(key))) return defaultRaceFilter(today);

	const grades = params.getAll('grade');
	return {
		year: parseYear(params.get('year')),
		grades: GRADES.filter((g) => grades.includes(g)),
		q: params.get('q')?.trim() ?? ''
	};
}

/** 何か1つでも絞っているか。「条件に合うものがありません」とクリアの出し分けに使う。 */
export function hasRaceFilter(filter: RaceFilter): boolean {
	return filter.year !== null || filter.grades.length > 0 || filter.q !== '';
}

/**
 * 年度の選択肢。**今年は、まだ1レースも無くても入れる。**
 *
 * 選択肢は登録済みのレースの年から組む（`listRaceYears`）。年明けで今年のレースが
 * まだ無いと、既定の「今年」が選択肢に無く、フォームは「すべて」を選んだように見えてしまう。
 */
export function yearOptions(years: number[], today: string): number[] {
	const thisYear = Number(today.slice(0, 4));
	return years.includes(thisYear) ? years : [...years, thisYear].sort((a, b) => b - a);
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
