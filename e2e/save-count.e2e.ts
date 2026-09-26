import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { COUNT_RACE_ID } from './seed';

/*
 * 一括保存の件数。押す前の「未保存の変更が N 件」と、保存したときの「保存しました（N 件）」がそろう。
 * どちらも**変えたメモの数**（レースのメモ、または1頭ぶんで1件）。
 *
 * 同じレース（E2E件数賞）を書いては戻すので、テストはこのファイルの中で順に走らせる
 * （Playwright はファイルの中を順に回す）。
 */

/**
 * ★ 押す前に出ていた「未保存の変更が N 件」と、保存したときの「保存しました（N 件）」がそろう。
 *
 * 以前は、未保存は**欄の数**（1頭に本文・札・印を付けると3件）、保存は**空でないメモの総数**
 * （触っていない馬の保存済みメモも入る）で数えていて、1頭書いただけで「3 件」→「2 件」になっていた。
 * 件数が変わると、何か操作を間違えたのかと読ませてしまう。1件はメモ1つ（1頭ぶん）にそろえる。
 */
test('予想: 1頭に本文・札・印を付けると未保存は1件で、保存の知らせも1件', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${COUNT_RACE_ID}/preview`);

	const row = page.locator('li[id^="entry-"]', { hasText: 'E2Eコレカラ' });
	await row.getByText('＋ 出走前メモ').click();
	await row.locator('textarea').fill('距離短縮で前に行けそう。');
	await row.getByRole('checkbox', { name: '次走買い' }).check({ force: true });
	await row.getByRole('radio', { name: '▲' }).check({ force: true });
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();

	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	// 保存済みのメモ（E2Eカキズミ）は触っていないので数えない。
	const toast = (text: string) => page.locator('[data-sonner-toast]', { hasText: text });
	await expect(toast('保存しました（1 件）')).toBeVisible();

	// 後片付け。すべて空で保存すると消える。レースの見立ても一緒に書いて、2つなら2件と出ることも見る。
	await page.locator('textarea[name="raceNoteBody"]').fill('前に行ける馬から。');
	// 出走前メモの欄は開いたまま（保存しても畳まない）。
	await row.locator('textarea').fill('');
	await row.getByRole('checkbox', { name: '次走買い' }).uncheck({ force: true });
	await row.getByRole('radio', { name: 'なし' }).check({ force: true });
	await expect(page.getByText('未保存の変更が 2 件あります')).toBeVisible();
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	// 前の知らせが残っていることがあるので、文で選ぶ。
	await expect(toast('保存しました（2 件）')).toBeVisible();

	await page.locator('textarea[name="raceNoteBody"]').fill('');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('未保存の変更が', { exact: false })).toHaveCount(0);
});

/**
 * ふりかえり画面でも同じ数え方になる。あわせて2つの食い違いを見る。
 * - 送信中に書き足した分は届いていないので、保存の件数に入れず、未保存に残す
 * - 本文の前後の空白は、サーバーが落として保存する。落とした値で欄が描き直されても、
 *   それを未保存に数えない（数えると「保存しました」の直後に「未保存の変更が 1 件」が出る）
 */
test('ふりかえり: 送信中に書き足した分は保存の件数に入らず、末尾の空白は未保存に残らない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${COUNT_RACE_ID}`);
	const toast = (text: string) => page.locator('[data-sonner-toast]', { hasText: text });
	const row = page.locator('li', { has: page.getByRole('link', { name: 'E2Eコレカラ' }) });
	const body = row.locator('textarea');
	const raceNote = page.locator('textarea[name="raceNoteBody"]');
	const save = page.getByRole('button', { name: 'まとめて保存' });

	await body.fill('直線で詰まった。');
	await row.getByRole('checkbox', { name: '不利' }).check({ force: true });
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();

	// POST だけを止め、その間にレースのメモを書き足す。
	let release = () => {};
	const released = new Promise<void>((r) => (release = r));
	const isThisPage = (url: URL) => url.pathname === `/races/${COUNT_RACE_ID}`;
	await page.route(isThisPage, async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		await released;
		await route.continue();
	});
	await save.click();
	await expect(page.getByRole('button', { name: '保存しています…' })).toBeVisible();
	await raceNote.fill('スローの前残り。');
	release();

	// 届いたのは1頭ぶんだけ。書き足したレースのメモは未保存のまま。
	await expect(toast('保存しました（1 件）')).toBeVisible();
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	await page.unroute(isThisPage);

	// 末尾に空白を付けて書き直す。保存されるのは空白を落とした値で、欄もそれで描き直される。
	await body.fill('外に出せず。 ');
	await expect(page.getByText('未保存の変更が 2 件あります')).toBeVisible();
	await save.click();
	await expect(toast('保存しました（2 件）')).toBeVisible();
	await expect(body).toHaveValue('外に出せず。');
	await expect(save).toHaveCount(0);

	// 空白を足しただけでは、変更に数えない（サーバーは何も変えない）。
	await body.fill('外に出せず。  ');
	await expect(save).toHaveCount(0);

	// 後片付け。すべて空で保存すると消える。
	await body.fill('');
	await row.getByRole('checkbox', { name: '不利' }).uncheck({ force: true });
	await raceNote.fill('');
	await expect(page.getByText('未保存の変更が 2 件あります')).toBeVisible();
	await save.click();
	await expect(save).toHaveCount(0);
});
