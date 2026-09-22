import { expect, test, type Page } from '@playwright/test';
import { HORSE_ID, SESSION_TOKEN } from './seed';

const TIMELINE = 'main ol > li';

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

test('未ログインでは馬詳細を開けない', async ({ page }) => {
	await page.goto(`/horses/${HORSE_ID}`);

	// 行き先は redirect に持ち越される（ログインしたらそのまま馬詳細へ戻る）。
	await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(`/horses/${HORSE_ID}`)}`);
	// 出走の中身が1つも漏れていないこと。
	await expect(page.getByText('E2E未来賞')).toHaveCount(0);
});

test('メモを書かなかった出走もタイムラインに並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	// 何も書いていない2走が、走った事実として出ていること。
	await expect(page.getByText('新潟10R E2E特別 (3勝クラス) 5着')).toBeVisible();
	await expect(page.getByText('東京11R E2E未来賞 (G1)')).toBeVisible();
	await expect(page.getByText('出走', { exact: true })).toBeVisible();

	// メモを書いた出走は**メモの行だけ**。同じレースが2行にならないこと。
	await expect(page.getByText('中山11R E2Eステークス (G3) 3着')).toHaveCount(1);
	await expect(page.getByText('直線だけの競馬になった。')).toBeVisible();
});

test('タイムラインは未来から過去の順に並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	const rows = page.locator(TIMELINE);

	// 先頭は出走予定（まだ走っていないので着順は出ない）。
	await expect(rows.first()).toContainText('2099-04-04');
	await expect(rows.first()).toContainText('出走予定');

	// 以降は日付の降順。過去ほど下に沈む。
	const dates = (await rows.allInnerTexts()).map((t) => t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');
	expect(dates).toEqual([...dates].sort().reverse());
	expect(dates.at(-1)).toBe('2026-06-14');
});
