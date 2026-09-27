import type { Snapshot } from '@sveltejs/kit';
import { tick } from 'svelte';
import { goto, preloadData } from '$app/navigation';
import { appendPage, pageHref, type Page } from './paging';

/** あとから読んで足した分。`key`（開いている URL のクエリ）ごとに持つ。 */
export type PagedExtra<T> = { key: string; items: T[]; next: number | null };

/** 戻る（ブラウザバック）ときのために残すもの。 */
export type PagedSnapshot<T> = { extra: PagedExtra<T> | null; scrollY: number };

/**
 * `load` が返した1ページ目に、あとから読んだページを足していく一覧（下端の `LoadMore` が読む）。
 *
 * 次のページは `?offset=` を付けた同じ URL の `load` を `preloadData` で呼んで読む。
 * 専用の API は作らない（→ api.md 第1章）。**その `load` は読んだ位置を `offset` で返すこと**
 * （読めたかどうかの見分けに使う → `loadNext`）。
 *
 * **足した分は URL のクエリ（`key`）に紐づける。** 絞り込みを変えて開き直すと `load` の
 * 1ページ目が替わるので、`key` が変わった時点で足した分は捨てて、新しい1ページ目から出し直す。
 * `$effect` で消すのではなく読むときに `key` を見比べるので、古い行が一瞬混ざることもない。
 *
 * 戻る（ブラウザバック）で読み込んだ分を失わないよう、`snapshot` をページの
 * `export const snapshot` に渡す。
 */
export class PagedList<T extends { id: string }> {
	#source: () => { url: URL; page: Page<T> };
	#pick: (data: Record<string, unknown>) => Page<T>;
	#extra = $state<PagedExtra<T> | null>(null);

	#key = $derived.by(() => this.#source().url.search);

	/** 今の `key` に対して足した分。`key` が変わっていれば無い。 */
	#current = $derived.by(() => {
		const extra = this.#extra;
		return extra && extra.key === this.#key ? extra : null;
	});

	/** 出す行。1ページ目 + 足した分。 */
	readonly items = $derived.by(() => {
		const first = this.#source().page.items;
		return this.#current ? appendPage(first, this.#current.items) : first;
	});

	/** 次に読むページの先頭。`null` なら続きは無い。 */
	readonly next = $derived.by(() =>
		this.#current ? this.#current.next : this.#source().page.next
	);

	/** 次のページの URL（JS が無いときのリンク先にもなる）。続きが無ければ `null`。 */
	readonly href = $derived.by(() =>
		this.next === null ? null : pageHref(this.#source().url, this.next)
	);

	/**
	 * @param source 開いている URL と、`load` が返した1ページ目
	 * @param pick 次のページの `load` の戻り値から、ページを取り出す
	 */
	constructor(
		source: () => { url: URL; page: Page<T> },
		pick: (data: Record<string, unknown>) => Page<T>
	) {
		this.#source = source;
		this.#pick = pick;
	}

	/**
	 * 次のページを読んで足す。読めなければ投げる（`LoadMore` が「もう一度」を出す）。
	 *
	 * 読んでいる間に絞り込みを変えて開き直していたら、読んだ分は捨てる（別の一覧の続きなので）。
	 * ログインが切れていたら、`load` が返すリダイレクト（ログイン画面）へそのまま進む。
	 */
	async loadNext(): Promise<void> {
		const href = this.href;
		const offset = this.next;
		if (href === null || offset === null) return;
		const key = this.#key;

		const result = await preloadData(href);
		if (result.type === 'redirect') {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- 行き先は load が返したリダイレクト（ログイン画面）
			await goto(result.location);
			return;
		}
		// **読めなかったことは status では分からない。** `preloadData` は load が落ちても通信が切れても
		// 投げず、いま開いているページのデータを status 200 で返す（SvelteKit の preload_error）。
		// load は読んだ位置（`offset`）を返すので、頼んだ位置と違えば読めなかったとみなす。
		if (result.status >= 400 || result.data.offset !== offset) {
			throw new Error(`続きを読めなかった（${href}）`);
		}
		if (key !== this.#key) return;

		const page = this.#pick(result.data);
		this.#extra = {
			key,
			items: [...(this.#current?.items ?? []), ...page.items],
			next: page.next
		};
	}

	/**
	 * ページの `export const snapshot` にそのまま渡す。
	 *
	 * **スクロール位置も自分で戻す。** SvelteKit は戻るときにスクロールを戻してから snapshot を
	 * 戻すので、足した行が描かれる前の短いページで位置が頭打ちになる。行を戻して描いたあとに合わせ直す。
	 */
	readonly snapshot: Snapshot<PagedSnapshot<T>> = {
		capture: () => ({ extra: this.#current, scrollY: window.scrollY }),
		restore: async ({ extra, scrollY }) => {
			this.#extra = extra;
			if (!extra) return;
			await tick();
			window.scrollTo(0, scrollY);
		}
	};
}
