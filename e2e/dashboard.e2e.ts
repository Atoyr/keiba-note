import { expect, test, type Page } from '@playwright/test';
import { SESSION_TOKEN } from './seed';

/** seed で用意したセッションを Cookie に載せる（本番ビルドにモック認証は無い）。 */
async function login(page: Page) {
	await page.context().addCookies([
		{
			name: 'session',
			value: SESSION_TOKEN,
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
}

/** JST の今日。サーバー側の `todayJst()` と同じ境目で見る。 */
const todayJst = () =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Tokyo',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());

/**
 * 「直近のレース」は5件しか出さない。日付の降順だと、先に登録しただけの重賞が
 * 上を埋めて**次のレースが一覧から落ちる**。並びの規則そのものを押さえる
 * （seed 以外の行が入っていても崩れないように、件数や特定の日付には寄せない）。
 */
test('ダッシュボードの「直近のレース」は次のレースから並ぶ', async ({ page }) => {
	await login(page);
	await page.goto('/');

	const texts = await page.locator('main section ul > li').allInnerTexts();
	const dates = texts.map((t) => t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');
	expect(dates.length).toBeGreaterThan(0);

	const today = todayJst();
	const future = dates.filter((d) => d > today);
	const past = dates.filter((d) => d <= today);

	// 未来が先、過去が後。
	expect(dates).toEqual([...future, ...past]);
	// 未来は近い順。**先頭がいちばん近い予定＝次のレース。**
	expect(future).toEqual([...future].sort());
	// 過去は新しい順。
	expect(past).toEqual([...past].sort().reverse());
});

/** レース一覧もダッシュボードと同じ順で見える（読んでいるのは同じ `listRaces`）。 */
test('レース一覧も次のレースから並ぶ', async ({ page }) => {
	await login(page);
	await page.goto('/races');

	const texts = await page.locator('main ul > li').allInnerTexts();
	const dates = texts.map((t) => t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');

	// seed に置いた3つの未来レースが、近い順に並んでいること。
	const order = ['2099-04-04', '2099-05-05', '2099-12-26'].map((d) => dates.indexOf(d));
	expect(order.every((i) => i >= 0)).toBe(true);
	expect(order).toEqual([...order].sort((a, b) => a - b));

	// 未来のあとに過去が来る。
	expect(dates.indexOf('2026-06-14')).toBeGreaterThan(order[2]);
});
