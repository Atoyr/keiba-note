import { error } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { loadFontFromAssets, renderPng } from '$lib/server/og/render';
import { getSharedRaceSummary } from '$lib/server/services/race-shares';
import { raceSummaryCardSvg } from '$lib/utils/share-card';
import type { RequestHandler } from './$types';

/**
 * 予想まとめの共有リンクを SNS に貼ったときの画像（og:image）。印の並びを描く。
 *
 * 共有ページと同じく、読むのは共有のコピーと公開名だけ。取り消したら 404。
 * キャッシュさせないのも共有ページと同じ（取り消したあとに残らないように）。
 * 取りに来るのは SNS のクローラーで、1回取れば向こうが持つので、毎回描いても数は出ない。
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!platform?.env.DB) error(503, 'データベースに接続できません');
	const shared = await getSharedRaceSummary(
		createDb(platform.env, locals.monitor.onQuery),
		params.id
	);
	if (!shared) error(404, 'このページは見つかりません');
	// wasm は src/worker.js が渡す。vite dev では通らないので無い（画像は wrangler で動かしたときだけ）。
	const wasm = platform.env.RESVG_WASM;
	if (!wasm) error(503, '画像を作れません');
	const png = await renderPng(raceSummaryCardSvg(shared.content, shared.authorName), {
		wasm,
		loadFont: () => loadFontFromAssets(platform.env.ASSETS)
	});
	return new Response(png, {
		headers: {
			'content-type': 'image/png',
			'x-robots-tag': 'noindex, nofollow',
			'cache-control': 'private, no-store'
		}
	});
};
