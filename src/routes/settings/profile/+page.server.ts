import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * 自分のプロフィール。ヘッダのアカウントメニューから開く。
 *
 * `ctx()` を使っていないのは D1 を引かないから。表示するものはすべて
 * セッションの中にあり、ここで DB を要求すると接続できないときに
 * 503 で落ちる画面が1つ増えるだけになる。
 */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) error(401, 'ログインが必要です');
	return { displayName: locals.user.displayName };
};
