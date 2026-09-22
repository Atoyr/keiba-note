import { expect, test, type Page } from '@playwright/test';
import { REVIEW_RACE_ID, SESSION_TOKEN } from './seed';

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

test('未ログインではふりかえり画面を開けない', async ({ page }) => {
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(`/races/${REVIEW_RACE_ID}`)}`);
	// 出走馬が1頭も漏れていないこと。
	await expect(page.getByText('E2Eウチワク')).toHaveCount(0);
});

/**
 * 着順に並ぶ画面なので、枠は色で読めないと「内で決まったのか」が分からない。
 * 色は JRA の帽子の色に合わせてあり、**数字も必ず一緒に出す**。
 */
test('出走馬の枠番が枠の色で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	// 1枠は白。面が背景と同じなので、輪郭が無いと消える。
	const inner = page.getByTitle('1枠');
	await expect(inner).toBeVisible();
	await expect(inner).toHaveText('1');
	await expect(inner).toHaveClass(/bg-white/);
	await expect(inner).toHaveClass(/border-gray-400/);

	// 8枠は桃。
	const outer = page.getByTitle('8枠');
	await expect(outer).toBeVisible();
	await expect(outer).toHaveText('8');
	await expect(outer).toHaveClass(/bg-pink-300/);

	// 枠の色は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText('16');
});
