import { expect, test } from '@playwright/test';

test('未ログインではトップに入れず、ログイン画面に飛ばされる', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?redirect=%2F$/);
	// ログイン画面だと分かる要素が出ていること。
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	await expect(page.getByText('招待制です')).toBeVisible();
	// ダッシュボード側の文言は出ていないこと（素通しになっていない確認）。
	await expect(page.getByRole('heading', { name: 'ようこそ' })).toHaveCount(0);
});

test('行き先が redirect パラメータとして保持される', async ({ page }) => {
	await page.goto('/settings/members');
	await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fmembers$/);
});

test('招待が必要なことが伝わる', async ({ page }) => {
	await page.goto('/login?error=invite_required');
	await expect(page.getByRole('alert')).toContainText('招待が必要です');
});
