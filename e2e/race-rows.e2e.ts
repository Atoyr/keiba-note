import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { ROW_RACE, EMPTY_RACE_ID } from './seed';
import { failNextAction } from './action-failure';

async function login(page: Page) {
	await page.context().addCookies([
		{
			name: 'session',
			value: 'roweditorsessiontoken000000000000',
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
}

const row = (page: Page, index: number) => page.locator(`#entry-${ROW_RACE.entries[index]}`);
const open = async (page: Page, index: number) =>
	row(page, index).locator('summary').first().click();
const detail = (page: Page, index: number) =>
	row(page, index).getByLabel(`${ROW_RACE.names[index]}の詳細情報`, { exact: true });
const route = `/races/${ROW_RACE.id}/preview`;

test('行・詳細・タブ・並び順を往復し、閉じた馬とレースの入力も一括保存する', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	await expect(row(page, 0).locator('textarea')).toBeHidden();
	await open(page, 0);
	await row(page, 0).locator('textarea').fill('内で脚をためる。');
	await row(page, 0).getByRole('radio', { name: '◎', exact: true }).check({ force: true });
	await row(page, 0).getByRole('checkbox', { name: '次走買い' }).check({ force: true });
	await detail(page, 0).click();
	const run = row(page, 0).locator('ol > li', { hasText: 'E2E行展開前走' });
	await expect(run).toContainText('18頭 3枠5番');
	await expect(run).toContainText('前走の出走前メモ');
	await expect(run).toContainText('前走のふりかえりメモ');
	await expect(
		run.getByRole('link', { name: 'この走りの画面でメモを確認・編集する' })
	).toHaveAttribute('href', '/races/01JE2ERACEROWPAST000000000');
	await expect(run).not.toContainText('近況はこの走りに付けない');
	await expect(page.getByText('他人の各走メモ')).toHaveCount(0);
	await open(page, 0);
	await open(page, 1);
	await expect(row(page, 1).getByText('過去走の記録がありません。')).toBeHidden();
	await detail(page, 1).click();
	await expect(row(page, 1).getByText('過去走の記録がありません。')).toBeVisible();
	await row(page, 1).locator('textarea').fill('外から進出する。');
	await page.getByLabel('レースの見立て', { exact: true }).fill('先行有利。');
	await page.getByRole('button', { name: '人気順', exact: true }).click();
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	await expect(page.getByRole('region', { name: '基本情報' })).toContainText('18頭');
	await expect(row(page, 1)).toBeHidden();
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（3 件）')).toBeVisible();
	await gotoHydrated(page, route);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
	await expect(row(page, 0).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(row(page, 0).getByRole('checkbox', { name: '次走買い' })).toBeChecked();
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('外から進出する。');
});

test('保存失敗後の閉じた入力を端末の下書きから明示復元する', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	await open(page, 0);
	await row(page, 0).locator('textarea').fill('保存失敗時の下書き');
	await open(page, 0);
	await failNextAction(page, route, { message: '行展開テストの保存失敗' });
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByRole('alert')).toContainText('行展開テストの保存失敗');
	await page.waitForFunction(() =>
		Object.keys(localStorage).some(
			(key) =>
				key.includes('draft:preview') && localStorage.getItem(key)?.includes('保存失敗時の下書き')
		)
	);
	page.on('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await expect(page.getByRole('button', { name: '復元する' })).toBeVisible();
	await page.getByRole('button', { name: '復元する' }).click();
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('保存失敗時の下書き');
});

test('ふりかえりの閉じた行も保存し、事前の予想を上書きしない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${ROW_RACE.id}`);
	await open(page, 0);
	await expect(row(page, 0)).toContainText('4角4番手→4着');
	await expect(row(page, 0)).toContainText('内で脚をためる。');
	await row(page, 0).locator('textarea').fill('直線の伸びをふりかえる。');
	await row(page, 0).getByRole('checkbox', { name: '好上り' }).check({ force: true });
	await open(page, 0);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, `/races/${ROW_RACE.id}`);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('直線の伸びをふりかえる。');
	await expect(row(page, 0)).toContainText('内で脚をためる。');
	await expect(row(page, 0).getByRole('checkbox', { name: '好上り' })).toBeChecked();
	await gotoHydrated(page, route);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
});

test('JS無効でも行と詳細を開いて一括保存し、資料と既存導線を読める', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await login(page);
	await page.goto(route);
	await expect(page.getByRole('region', { name: '基本情報' })).toBeVisible();
	await open(page, 1);
	await row(page, 1).locator('textarea').fill('JSなしで入力');
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('JSなしで入力');
	await page.goto(`/races/${ROW_RACE.id}`);
	await open(page, 1);
	await row(page, 1).locator('textarea').fill('JSなしでふりかえり');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('JSなしでふりかえり');
	await page.goto(`/races/${EMPTY_RACE_ID}`);
	await expect(page).toHaveURL(`/races/${EMPTY_RACE_ID}/preview`);
	await context.close();
});

test('一度も開かない馬の既存メモを保ち、別馬の印だけを保存してから意図して削除する', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, route);
	await open(page, 1);
	await row(page, 1).locator('textarea').fill('');
	await row(page, 1).getByRole('radio', { name: '☆', exact: true }).check({ force: true });
	await open(page, 1);
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, route);
	await expect(row(page, 1).locator('[title="予想印 ☆"]')).toBeVisible();
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
	await expect(row(page, 0).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(row(page, 0).getByRole('checkbox', { name: '次走買い' })).toBeChecked();
	await open(page, 1);
	await row(page, 1).getByRole('radio', { name: 'なし', exact: true }).check({ force: true });
	await open(page, 1);
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, route);
	await expect(row(page, 1)).toContainText('メモを入力する');
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('');
	await expect(row(page, 1).getByRole('radio', { name: 'なし', exact: true })).toBeChecked();
	await expect(row(page, 1).locator('[title="予想印 ☆"]')).toHaveCount(0);
});
