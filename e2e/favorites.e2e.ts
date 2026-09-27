import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { FAVORITE_HORSES, TIMELINE_RUN_RACES, TOGGLE_FAVORITE_HORSE_ID } from './seed';

const favorites = (page: Page) =>
	page
		.locator('main section')
		.filter({ has: page.getByRole('heading', { name: '推しの出走予定' }) });

test('ダッシュボードに自分の推しの出走予定だけが出る', async ({ page }) => {
	await login(page);
	await page.goto('/');

	const section = favorites(page);
	const row = section.locator('li', { hasText: FAVORITE_HORSES.running });
	await expect(row).toContainText('東京11R');
	await expect(row).toContainText('E2E未来賞');
	await expect(row).toContainText('3番');
	// 開催前のレースは予想画面へ。
	await expect(row.getByRole('link', { name: /E2E未来賞/ })).toHaveAttribute(
		'href',
		`/races/${TIMELINE_RUN_RACES.future}/preview`
	);

	// 走り終えたレースしか無い推しは、名前だけ出る。
	await expect(section.locator('li', { hasText: FAVORITE_HORSES.idle })).toHaveCount(0);
	await expect(section.getByText('出走予定の無い推し:')).toBeVisible();
	await expect(section.getByRole('link', { name: FAVORITE_HORSES.idle })).toBeVisible();

	// 別のユーザーの推しは、今週出走していても出ない。
	await expect(section.getByText(FAVORITE_HORSES.others)).toHaveCount(0);
});

test('馬の画面で推しにすると出走予定に並び、外すと消える', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${TOGGLE_FAVORITE_HORSE_ID}`);

	await page.getByRole('button', { name: '推しにする' }).click();
	await expect(page.getByRole('button', { name: '推しから外す' })).toBeVisible();
	await expect(page.getByText('推しにしました。出走予定はダッシュボードに並びます')).toBeVisible();

	await page.goto('/');
	await expect(favorites(page).locator('li', { hasText: FAVORITE_HORSES.toggle })).toContainText(
		'E2E今週賞'
	);

	await gotoHydrated(page, `/horses/${TOGGLE_FAVORITE_HORSE_ID}`);
	await page.getByRole('button', { name: '推しから外す' }).click();
	await expect(page.getByRole('button', { name: '推しにする' })).toBeVisible();

	await page.goto('/');
	await expect(favorites(page).getByText(FAVORITE_HORSES.toggle)).toHaveCount(0);
});

test('無い馬は推しにできない', async ({ page }) => {
	await login(page);
	const res = await page.request.post('/horses/01JE2ENOSUCHHORSE000000000?/favorite', {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: { favorite: '1' }
	});
	expect(res.status()).toBe(404);
});
