/** 重賞（`/graded-races`）の鍵とリンクの組み立て。 */

/**
 * 重賞の別名の表。1行 = 1重賞で、**先頭が鍵**（今年の枠の表記）、残りが別名。
 *
 * **重賞は「レース名」で束ねる**（年をまたいだ重賞の鍵がデータに無い）。名前は年で揺れる。
 * 今年の枠は JRA の表記だが、過去走（`data:fetch past`）は netkeiba の表記で、冠名や略しが付く
 * （`産経賞オールカマー`・`マイルチャンピオンS`）。そこで別名をこの表で鍵に寄せる。
 *
 * 名前で束ねるので、名前が変わった重賞はここに1行足す。足さないと別の重賞に割れる。
 * 表に無い名前はそのまま鍵になる。
 *
 * 行を足すと鍵が変わることがある（それまで鍵だった名前が別名になる）。古い鍵の傾向のメモは別名として読むので消えない。
 */
const GRADED_RACE_ALIASES: readonly (readonly [key: string, ...aliases: string[]])[] = [
	['オールカマー', '産経賞オールカマー'],
	['セントライト記念', '朝日セントライト記念'],
	['ローズステークス', '関西TVローズS', 'ローズS'],
	['セントウルS', '産経賞セントウルS'],
	['スワンS', 'MBS賞スワンS'],
	['ファンタジーS', 'KBSファンタジーS'],
	['サウジアラビアロイヤルC', 'サウジアラビアRC'],
	['マイルチャンピオンシップ', 'マイルチャンピオンS'],
	['朝日杯フューチュリティS', '朝日フューチュリティ'],
	['京都2歳S', 'ラジオN杯京都2歳S'],
	['東スポ杯2歳S', '東京スポーツ杯2歳S'],
	['京成杯AH', '京成杯オータムH'],
	['チャレンジカップ', 'チャレンジC'],
	['ダービー卿CT', 'ダービー卿チャレンジ'],
	['オークス', '優駿牝馬'],
	['阪神牝馬S', 'サンスポ杯阪神牝馬S'],
	['フローラS', 'サンスポ賞フローラS'],
	['マイラーズC', '読売マイラーズC'],
	['青葉賞', 'テレビ東京杯青葉賞'],
	['京都金杯', 'スポニチ賞京都金杯'],
	['中山金杯', '日刊スポ賞中山金杯'],
	['弥生賞ディープ記念', '報知弥生ディープ記念'],
	['金鯱賞', '東海テレビ杯金鯱賞'],
	['北九州記念', 'TV西日本北九州記念'],
	['シンザン記念', '日刊スポシンザン記念'],
	['ファルコンS', '中スポ賞ファルコンS'],
	['武蔵野S', '東京中日S杯武蔵野S'],
	['クイーンC', 'デイリー杯クイーンC'],
	['アイビスSD', 'アイビスサマーD'],
	['AJCC', 'アメリカジョッキーC']
];

/** 表の検査用（同じ名前が2つの行に出ていないか）。 */
export const GRADED_RACE_ALIAS_ROWS = GRADED_RACE_ALIASES;

const KEY_OF = new Map<string, string>(
	GRADED_RACE_ALIASES.flatMap(([key, ...aliases]) => aliases.map((a): [string, string] => [a, key]))
);

const NAMES_OF = new Map<string, string[]>(
	GRADED_RACE_ALIASES.map(([key, ...aliases]) => [key, [key, ...aliases]])
);

/** レース名 → 重賞の鍵。前後の空白を除き、別名なら鍵に、そうでなければそのまま返す。 */
export function gradedRaceKey(name: string): string {
	const n = name.trim();
	return KEY_OF.get(n) ?? n;
}

/** 鍵と別名すべて（DB を `name IN (...)` で引くため）。表に無い鍵は `[key]`。 */
export function gradedRaceNames(key: string): string[] {
	return NAMES_OF.get(key) ?? [key];
}

/**
 * `/graded-races/[name]` の name に入れる値。`resolve()` は params をエンコードしないので
 * ここでする（`jockeyParam` と同じ）。受け側の `params.name` は復号済み。
 */
export function gradedRaceParam(key: string): string {
	return encodeURIComponent(key);
}

/** G1〜G3 か（重賞）。L・OP・格なしは重賞ではない。 */
export function isGraded(grade: string | null | undefined): grade is 'G1' | 'G2' | 'G3' {
	return grade === 'G1' || grade === 'G2' || grade === 'G3';
}
