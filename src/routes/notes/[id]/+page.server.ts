import { error } from '@sveltejs/kit';
import { getSharedNote } from '$lib/server/services/notes';
import { createDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/**
 * 共有ページ。**未ログインで到達できる唯一のルート**（hooks.server.ts の PUBLIC_PATHS）。
 *
 * ここだけが `visibility` を見る。他のすべての読みは author_id で自分のメモに
 * 閉じている（product.md 第2章 2-2）。
 */
export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	if (!platform?.env?.DB) error(503, 'データベースに接続できません');

	// 要件「検索することはできない」のサイト外ぶん。
	//
	// robots.txt で /notes/ を Disallow して**いない**のは意図的で、
	// クロールを止めるとクローラが noindex を読めず、外部からリンクされた URL が
	// 「内容なしの URL だけ」の形でインデックスされうるため。
	// 狙いはクロールの拒否ではなくインデックスの拒否（product.md 第6章）。
	setHeaders({
		'x-robots-tag': 'noindex, nofollow',
		// 共有ページから外部リンクを踏んでも、この URL が Referer で渡らないように。
		'referrer-policy': 'no-referrer',
		'cache-control': 'private, no-store'
	});

	const note = await getSharedNote(createDb(platform.env), params.id);

	// **404 にするのが要点。** 403 を返すと「その ID のメモは在る」ことを教えてしまう。
	// private でも存在しなくても同じ応答になる。
	if (!note) error(404, 'このページは見つかりません');

	return { note };
};
