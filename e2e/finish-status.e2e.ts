import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { CANCELED_HORSE_NAME, PREVIEW_RACE_ID, REVIEW_RACE_ID, STATUS_EDIT_RACE_ID } from './seed';

// 着順が無い理由（取消・除外）。予想画面は馬名の右の札、ふりかえり画面は着順の位置に語で出す。

test('予想画面は、除外の馬の馬名の右に「除外」の札を出す', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	const row = page.locator('main li[id^="entry-"]');
	await expect(row.locator('[data-name-row]').getByText('除外', { exact: true })).toBeVisible();
});

test('ふりかえり画面は、取消の馬の着順の位置に「取消」を出す。着順のある馬には出さない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${REVIEW_RACE_ID}`);

	const canceled = page.locator('main li', { hasText: CANCELED_HORSE_NAME }).last();
	await expect(canceled.getByText('取消', { exact: true })).toBeVisible();
	await expect(page.getByText('3着', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('取消', { exact: true })).toHaveCount(1);
});

test('出走馬の編集で状態を選んで保存すると、ふりかえり画面に出る', async ({ page }) => {
	// 出走馬の編集は管理者だけが開ける。
	await login(page, 'admin');
	await gotoHydrated(page, `/races/${STATUS_EDIT_RACE_ID}/entries`);

	await page.locator('select[name="finishStatus.0"]').selectOption('取消');
	await page.getByRole('button', { name: '保存してふりかえりへ' }).click();

	await expect(page).toHaveURL(`/races/${STATUS_EDIT_RACE_ID}`);
	await expect(page.getByText('取消', { exact: true })).toBeVisible();

	// 着順も入れて保存すると、一緒には入れられない誤りになる。
	await gotoHydrated(page, `/races/${STATUS_EDIT_RACE_ID}/entries`);
	await expect(page.locator('select[name="finishStatus.0"]')).toHaveValue('取消');
	await page.locator('input[name="finishPosition.0"]').fill('2');
	await page.getByRole('button', { name: '保存してふりかえりへ' }).click();
	await expect(page.getByRole('alert')).toContainText('一緒に入れられません');
});
