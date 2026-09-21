import { expect, test } from '@playwright/test';

test('未ログインではトップに入れず、ログイン画面に飛ばされる', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?redirect=%2F$/);
	// ログイン画面だと分かる要素が出ていること。
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	await expect(page.getByText('メモは既定で非公開')).toBeVisible();
	// ダッシュボード側の文言は出ていないこと（素通しになっていない確認）。
	await expect(page.getByRole('heading', { name: 'ようこそ' })).toHaveCount(0);
});

test('行き先が redirect パラメータとして保持される', async ({ page }) => {
	await page.goto('/settings/shares');
	await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fshares$/);
});

test('共有ページはログイン不要で開ける（存在しないメモは 404）', async ({ page }) => {
	// 未ログインでも /login に飛ばされないこと。
	// visibility='unlisted' の行が無いので 404 になるのが正しい挙動
	// （private でも存在しなくても同じ応答。403 にすると存在が漏れる）。
	const res = await page.goto('/notes/01JXXXXXXXXXXXXXXXXXXXXXXX');
	expect(res?.status()).toBe(404);
	await expect(page).not.toHaveURL(/\/login/);
});

test('共有ページは検索エンジンに載せない', async ({ page }) => {
	const res = await page.goto('/notes/01JXXXXXXXXXXXXXXXXXXXXXXX');
	expect(res?.headers()['x-robots-tag']).toContain('noindex');
});
