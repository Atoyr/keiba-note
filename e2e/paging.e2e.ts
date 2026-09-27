import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { PAGED_LIST } from './seed';

/**
 * レース一覧・馬一覧は100件ずつ読み、下端に近づくと続きを足す（`LoadMore` / `PagedList`）。
 * seed に1ページを超えるレース（2001年）と馬（E2E一覧ウマ）が 105 件ずつある。
 */
const RACES = `/races?year=${PAGED_LIST.raceYear}`;
const HORSES = `/horses?q=${encodeURIComponent(PAGED_LIST.horsePrefix)}`;

const raceLinks = (page: Page) => page.getByRole('link', { name: /E2E一覧レース/ });
const horseLinks = (page: Page) =>
	page.getByRole('link', { name: new RegExp(PAGED_LIST.horsePrefix) });
const loadMore = (page: Page) => page.getByRole('link', { name: '続きを読み込む' });

test('レース一覧は100件ずつ出し、下端までスクロールすると続きが足される', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, RACES);

	// 件数は読んだ分ではなく、絞り込みに当たる全体。
	await expect(page.getByText(`${PAGED_LIST.raceCount} 件`, { exact: true })).toBeVisible();
	await expect(raceLinks(page)).toHaveCount(100);
	// 日付の新しい順なので、いちばん古い 001 は2ページ目。
	await expect(page.getByRole('link', { name: /E2E一覧レース001/ })).toHaveCount(0);

	await loadMore(page).scrollIntoViewIfNeeded();

	await expect(raceLinks(page)).toHaveCount(PAGED_LIST.raceCount);
	await expect(page.getByRole('link', { name: /E2E一覧レース001/ })).toBeVisible();
	await expect(loadMore(page)).toHaveCount(0);
	// その場で足すだけで、URL は変えない（リロードや共有で1ページ目から出る）。
	await expect(page).toHaveURL(RACES);
});

test('絞り込みを変えると、足した分は捨てて新しい条件の1ページ目から出す', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, RACES);
	await loadMore(page).scrollIntoViewIfNeeded();
	await expect(raceLinks(page)).toHaveCount(PAGED_LIST.raceCount);

	await page.getByLabel('レース名').fill('E2E一覧レース10');
	await page.getByRole('button', { name: '絞り込む' }).click();

	await expect(page.getByText('6 件', { exact: true })).toBeVisible();
	await expect(raceLinks(page)).toHaveCount(6);
	await expect(loadMore(page)).toHaveCount(0);
});

test('馬一覧は「続きを読み込む」を押しても続きが足される', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, HORSES);
	await expect(horseLinks(page)).toHaveCount(100);

	await loadMore(page).click();

	await expect(horseLinks(page)).toHaveCount(PAGED_LIST.horseCount);
	await expect(page).toHaveURL(HORSES);
});

/**
 * キーボードで読んだとき。最後のページを読むとボタンが消えるので、そのままだとフォーカスが
 * body に落ちて次の Tab が先頭からになる。足した最初の行へ移す。
 */
test('キーボードで続きを読むと、足した最初の行にフォーカスが移る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, HORSES);

	await loadMore(page).focus();
	await page.keyboard.press('Enter');

	await expect(horseLinks(page)).toHaveCount(PAGED_LIST.horseCount);
	await expect(
		page.getByRole('link', { name: new RegExp(`${PAGED_LIST.horsePrefix}101`) })
	).toBeFocused();
});

/**
 * `preloadData` は読めなくても投げず、いまのページのデータを返す。それを「読めた」と取り違えて
 * 黙って何も足さない、ということが無いように、失敗が文で出て押し直せることを見る。
 */
test('続きを読めなければ文を出し、「もう一度読み込む」で読み直せる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, HORSES);
	const data = (url: URL) => url.pathname.endsWith('/__data.json');
	await page.route(data, (route) => route.abort());

	await loadMore(page).click();

	await expect(page.getByRole('alert')).toContainText('続きを読み込めませんでした');
	await expect(horseLinks(page)).toHaveCount(100);

	await page.unroute(data);
	await page.getByRole('link', { name: 'もう一度読み込む' }).click();

	await expect(horseLinks(page)).toHaveCount(PAGED_LIST.horseCount);
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('続きを読んでから馬を開いて戻ると、読んだ分とスクロール位置が残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, HORSES);
	await loadMore(page).scrollIntoViewIfNeeded();
	const last = page.getByRole('link', { name: new RegExp(`${PAGED_LIST.horsePrefix}105`) });
	await last.scrollIntoViewIfNeeded();

	await last.click();
	await expect(page).toHaveURL(/\/horses\/01JE2EPAGEHORSE/);
	await page.goBack();

	await expect(horseLinks(page)).toHaveCount(PAGED_LIST.horseCount);
	await expect(last).toBeInViewport();
});

test.describe('JavaScript が無いとき', () => {
	test.use({ javaScriptEnabled: false });

	test('「続きを読み込む」で次の100件のページへ移り、先頭へ戻れる', async ({ page }) => {
		await login(page);
		await page.goto(RACES);
		await expect(raceLinks(page)).toHaveCount(100);

		await loadMore(page).click();

		await expect(page).toHaveURL(`${RACES}&offset=100`);
		await expect(raceLinks(page)).toHaveCount(PAGED_LIST.raceCount - 100);
		await expect(page.getByText('101 件目から')).toBeVisible();
		await expect(loadMore(page)).toHaveCount(0);

		await page.getByRole('link', { name: '先頭から見る' }).click();
		await expect(page).toHaveURL(RACES);
		await expect(raceLinks(page)).toHaveCount(100);
	});

	test('馬一覧も、次の100頭のページへ移って先頭へ戻れる', async ({ page }) => {
		await login(page);
		await page.goto(HORSES);

		await loadMore(page).click();

		await expect(horseLinks(page)).toHaveCount(PAGED_LIST.horseCount - 100);
		await expect(page.getByText('101 頭目から')).toBeVisible();

		await page.getByRole('link', { name: '先頭から見る' }).click();
		await expect(horseLinks(page)).toHaveCount(100);
	});
});
