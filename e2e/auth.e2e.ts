import { expect, test } from '@playwright/test';
import { BRACKET_RACE_ID, DASHBOARD_RACES, EMPTY_RACE_ID, HORSE_ID, PREVIEW_RACE_ID } from './seed';

test('未ログインのトップは紹介ページで、ダッシュボードの中身は出ない', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1, name: 'uma-memo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();

	// `/` は誰でも開ける。seed のメモやレースが1文字も漏れていないこと。
	await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toHaveCount(0);
	await expect(page.getByText(DASHBOARD_RACES.thisWeek)).toHaveCount(0);
});

test('ログイン画面にもログインの入口がある', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	await expect(page.getByText('メモは既定で非公開')).toBeVisible();
});

test('プライバシーポリシーと利用規約は未ログインで読め、紹介ページとログイン画面から辿れる', async ({
	page
}) => {
	// Google の同意画面に URL を登録するページ。ログインへ飛ばされると登録できない。
	await page.goto('/');
	await page.getByRole('link', { name: 'プライバシーポリシー' }).first().click();
	await expect(page).toHaveURL('/privacy');

	await page.goto('/login');
	await page.getByRole('link', { name: 'プライバシーポリシー' }).click();
	await expect(page).toHaveURL('/privacy');
	await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();

	await page.goto('/login');
	await page.getByRole('link', { name: '利用規約' }).click();
	await expect(page).toHaveURL('/terms');
	await expect(page.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible();
});

/**
 * 認証は hooks.server.ts の `PUBLIC_PATHS` 以外を一律で弾く作り。画面ごとに
 * テストを分けても同じ分岐を通るだけなので、ここに1行ずつ足していく。
 *
 * 見ているのは2つ。行き先が redirect に持ち越されること（ログイン後に戻れる）と、
 * seed に入れた中身が1文字も漏れていないこと。**画面を足したらここに1行足す。**
 */
const PROTECTED: { path: string; secret: string | null }[] = [
	// `/` は紹介ページのために完全一致で公開している。その下まで開いていないこと。
	{ path: '/races', secret: null },
	{ path: '/this-week', secret: null },
	{ path: '/settings/shares', secret: null },
	{ path: '/settings/profile', secret: null },
	{ path: `/races/${PREVIEW_RACE_ID}/summary`, secret: '今回は内枠が向きそう。' },
	{ path: '/settings/admin', secret: null },
	{ path: `/horses/${HORSE_ID}`, secret: 'E2E未来賞' },
	{ path: `/races/${BRACKET_RACE_ID}`, secret: 'E2Eウチワク' },
	// 開催前のレースは予想画面へ振り分けられる。**認証がその振り分けより先に効く**ことを見る
	// （追い越されると redirect が /preview になり、未ログインのまま中身が出る）。
	{ path: `/races/${EMPTY_RACE_ID}`, secret: 'E2E出馬表前賞' },
	{ path: `/races/${PREVIEW_RACE_ID}/preview`, secret: '今回は内枠が向きそう。' }
];

for (const { path, secret } of PROTECTED) {
	test(`未ログインでは ${path} を開けず、行き先が redirect に残る`, async ({ page }) => {
		await page.goto(path);

		await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(path)}`);
		if (secret) await expect(page.getByText(secret)).toHaveCount(0);
	});
}
