import { expect, test } from '@playwright/test';
import { failNextAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { expectLinkTo } from './link';
import { login } from './login';
import { FAVORITE_HORSES, OTHERS_FAVORITE_HORSE_ID } from './seed';

/**
 * 馬一覧の「推し馬のみ」と、行の星からの解除。外す馬は seed の専用の2頭（E2Eハズシイチ・E2Eハズシニ）だけ。
 * ファイル内は順に走るので、外す順（イチ → ニ）に依存してよい。
 */
const origin = () => `http://localhost:${process.env.E2E_PORT ?? 4173}`;
const rows = (page: import('@playwright/test').Page) => page.locator('main ul > li');

test('推し馬のみには本人の推しだけが出て、検索と併用でき、検索しても残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/horses?favorite=1');

	await expect(page.getByLabel('推し馬のみ')).toBeChecked();
	await expect(rows(page).filter({ hasText: FAVORITE_HORSES.running })).toHaveCount(1);
	await expect(rows(page).filter({ hasText: FAVORITE_HORSES.idle })).toHaveCount(1);
	// 別のユーザーの推しと、推しでない馬は出ない。
	await expect(page.getByText(FAVORITE_HORSES.others)).toHaveCount(0);
	await expect(page.getByText(FAVORITE_HORSES.toggle)).toHaveCount(0);

	await page.getByLabel('馬名', { exact: true }).fill('ハズシ');
	await page.getByRole('button', { name: '検索' }).click();
	await expect(page).toHaveURL(/favorite=1/);
	await expect(page).toHaveURL(/q=/);
	await expect(rows(page)).toHaveCount(2);
	await expect(page.getByLabel('推し馬のみ')).toBeChecked();
	await expect(page.getByLabel('馬名', { exact: true })).toHaveValue('ハズシ');
});

test('全馬の一覧にはチェックが無く星も出ない。チェックして検索すると推し馬のみになり星が出る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, '/horses');

	await expect(page.getByLabel('推し馬のみ')).not.toBeChecked();
	await expect(page.getByRole('button', { name: /を推しから外す$/ })).toHaveCount(0);

	await page.getByLabel('推し馬のみ').check();
	await page.getByRole('button', { name: '検索' }).click();
	await expect(page).toHaveURL(/favorite=1/);
	await expect(
		page.getByRole('button', { name: `${FAVORITE_HORSES.running}を推しから外す` })
	).toBeVisible();
});

test('外せなかったら行が残って失敗の文が出て、もう一度押すと外れ、フォーカスが次の行の星へ移る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, '/horses?favorite=1');

	const star = page.getByRole('button', { name: `${FAVORITE_HORSES.miss1}を推しから外す` });
	await failNextAction(page, '/horses', { horseId: 'x', message: '失敗' });
	await star.click();
	await expect(page.getByRole('alert')).toContainText('推しから外せませんでした');
	await expect(rows(page).filter({ hasText: FAVORITE_HORSES.miss1 })).toHaveCount(1);

	await star.click();
	await expect(rows(page).filter({ hasText: FAVORITE_HORSES.miss1 })).toHaveCount(0);
	await expect(page.getByText(`${FAVORITE_HORSES.miss1}を推しから外しました`)).toBeVisible();
	await expect(page.getByRole('alert').filter({ hasText: '推しから外せませんでした' })).toHaveCount(
		0
	);
	await expect(
		page.getByRole('button', { name: `${FAVORITE_HORSES.miss2}を推しから外す` })
	).toBeFocused();
});

test('admin は推しが0頭で、案内とすべての馬を見るリンクが出る。検索と併用して0件なら条件を外せる', async ({
	page
}) => {
	await login(page, 'admin');
	await page.goto('/horses?favorite=1');
	await expect(page.getByText('推しの馬はまだいません。')).toBeVisible();
	await expectLinkTo(page.getByRole('link', { name: 'すべての馬を見る' }), '/horses');

	await page.goto('/horses?favorite=1&q=E2E存在しない馬');
	await expect(page.getByText('見つかりませんでした。')).toBeVisible();
	await expectLinkTo(page.getByRole('link', { name: '検索条件を外す' }), '/horses?favorite=1');
});

test('別のユーザーの推しを外す POST を送っても、何も起きず成功する', async ({ page }) => {
	await login(page);
	const res = await page.request.post('/horses?/unfavorite', {
		headers: { origin: origin() },
		form: { horseId: OTHERS_FAVORITE_HORSE_ID }
	});
	expect(res.status()).toBe(200);
});

test.describe('JS 無し', () => {
	test.use({ javaScriptEnabled: false });

	test('星を押すと外れ、送信後の画面も推し馬のみのまま', async ({ page }) => {
		await login(page);
		await page.goto('/horses?favorite=1');
		await page.getByRole('button', { name: `${FAVORITE_HORSES.miss2}を推しから外す` }).click();

		await expect(page).toHaveURL(/favorite=1/);
		await expect(page.getByLabel('推し馬のみ')).toBeChecked();
		await expect(rows(page).filter({ hasText: FAVORITE_HORSES.running })).toHaveCount(1);
		await expect(rows(page).filter({ hasText: FAVORITE_HORSES.miss2 })).toHaveCount(0);
		// トーストの代わりの知らせは `<noscript>` の中（表示の有無は端末しだい）なので、HTML に入っていることを確かめる。
		expect(await page.content()).toContain('推しから外しました。');
	});
});
