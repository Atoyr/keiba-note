/**
 * 一覧を100件ずつ読むための道具。サーバー（何件目から引くか）と画面（次を読む URL）の両方が使う。
 *
 * 次のページも `load` で読む（専用の API は作らない → api.md 第1章）。画面は `?offset=` を付けた
 * 同じ URL の `load` を `preloadData` で呼んで足していく。JS が無ければ、同じ URL へのリンクで次の100件へ進む。
 */

/** 1回に読む件数。 */
export const PAGE_SIZE = 100;

/** 1ページ分の行と、次のページの先頭（何件目から）。次が無ければ `null`。 */
export type Page<T> = { items: T[]; next: number | null };

/**
 * `?offset=` → 何件目から読むか。
 *
 * 壊れた値・負の値・桁の多すぎる値は先頭（0）に倒す。URL は手で書き換えられるので、
 * 一覧ごと落とさずに1ページ目を出す。
 */
export function parseOffset(params: URLSearchParams): number {
	const raw = params.get('offset');
	return raw && /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
}

/**
 * `limit + 1` 件引いた行 → 1ページ。
 *
 * 余分に1件引けたら次がある。総数を数え直さずに「続きがあるか」だけ分かる。
 */
export function toPage<T>(rows: T[], offset: number, limit = PAGE_SIZE): Page<T> {
	return rows.length > limit
		? { items: rows.slice(0, limit), next: offset + limit }
		: { items: rows, next: null };
}

/**
 * `offset` 件目からのページの URL。絞り込みのクエリ（`year` `grade` `q`）はそのまま残し、
 * `offset` だけを替える。0 なら `offset` を外す（先頭のページ）。
 *
 * `url` は今開いている画面の URL（パスは base 込みで解決済み）。
 */
export function pageHref(url: URL, offset: number): string {
	const params = new URLSearchParams(url.searchParams);
	if (offset > 0) params.set('offset', String(offset));
	else params.delete('offset');
	const query = params.toString();
	return query ? `${url.pathname}?${query}` : url.pathname;
}

/**
 * 読んだページを足す。**同じ id の行は足さない。**
 *
 * 読む間に行が増えると、offset がずれて前のページの末尾がもう一度来る。
 * そのまま足すと `{#each}` のキーが重なって落ちるので、先に出ている行を残して捨てる。
 */
export function appendPage<T extends { id: string }>(items: T[], more: T[]): T[] {
	const seen = new Set(items.map((i) => i.id));
	return [...items, ...more.filter((i) => !seen.has(i.id))];
}
