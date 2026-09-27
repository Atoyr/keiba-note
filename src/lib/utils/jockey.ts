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
