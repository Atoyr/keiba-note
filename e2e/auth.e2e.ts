import { expect, test } from '@playwright/test';
import { BRACKET_RACE_ID, DASHBOARD_RACES, EMPTY_RACE_ID, HORSE_ID, PREVIEW_RACE_ID } from './seed';

test('未ログインではトップに入れず、ログイン画面に飛ばされる', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?redirect=%2F$/);
	// ログイン画面だと分かる要素が出ていること。
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	await expect(page.getByText('メモは既定で非公開')).toBeVisible();
});

/**
 * 認証は hooks.server.ts の `PUBLIC_PATHS` 以外を一律で弾く作り。画面ごとに
 * テストを分けても同じ分岐を通るだけなので、ここに1行ずつ足していく。
 *
 * 見ているのは2つ。行き先が redirect に持ち越されること（ログイン後に戻れる）と、
 * seed に入れた中身が1文字も漏れていないこと。**画面を足したらここに1行足す。**
 */
const PROTECTED: { path: string; secret: string | null }[] = [
	{ path: '/', secret: DASHBOARD_RACES.thisWeek },
	{ path: '/settings/shares', secret: null },
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
