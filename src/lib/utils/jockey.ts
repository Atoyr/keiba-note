import { JOCKEY_TAGS, type JockeyTag } from '$lib/schemas/jockey';

/** 騎手の画面のリンクの組み立て。 */

/**
 * `/jockeys/[name]` の name に入れる値。
 *
 * **騎手名は URL の中でエンコードして渡す。** `resolve()` は params をそのまま差し込むだけで
 * エンコードしない（SvelteKit の `resolve_route`）。騎手名は取得元の表記のままなので、
 * `?` や `#` が混ざっても別の URL にならないようにしておく。受け側の `params.name` は復号済み。
 */
export function jockeyParam(name: string): string {
	return encodeURIComponent(name);
}

/** 騎手の一覧（`/jockeys`）の絞り込みのクエリ。空の条件は付けない。先頭の `?` まで返す。 */
export function jockeyListQuery(filter: { q: string; tag: string | null }): string {
	const params = new URLSearchParams();
	if (filter.q.trim()) params.set('q', filter.q.trim());
	if (filter.tag) params.set('tag', filter.tag);
	const s = params.toString();
	return s ? `?${s}` : '';
}

/**
 * このレースに合う札だけ。レースの場の「○○巧者」と、芝・ダートの「芝巧者」「ダート巧者」。
 * 距離・道悪・乗り方・狙いどころの札は出さない（レースの条件だけでは合うかどうか決められない）。
 * 並びは `JOCKEY_TAGS` の順。
 */
export function raceJockeyTags(
	tags: readonly JockeyTag[],
	race: { course: string; surface: string | null }
): JockeyTag[] {
	const fit: string[] = [`${race.course}巧者`];
	if (race.surface === '芝') fit.push('芝巧者');
	if (race.surface === 'ダート') fit.push('ダート巧者');
	return JOCKEY_TAGS.filter((t) => tags.includes(t) && fit.includes(t));
}
