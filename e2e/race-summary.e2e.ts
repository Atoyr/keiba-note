import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { failNextAction } from './action-failure';
import { login } from './login';
import { MARKS_RACE_ID, SHARED_NOTE_ID, SHARED_RACE_ID, SUMMARY_RACE_ID } from './seed';

const summaryPath = `/races/${SUMMARY_RACE_ID}/summary`;

test('印なしのメモも表示し、見出し右側の予想リンクとシェアボタンを使える', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/summary`);
	const memoOnly = page.locator('li', { hasText: 'E2Eメモノミ' });
	await expect(memoOnly).toContainText('印は保留。距離延長での走りに注目。');
	await expect(memoOnly.locator('[title^="予想印"]')).toHaveCount(0);
	const shareButton = page.getByRole('button', { name: '予想をシェア', exact: true });
	await expect(shareButton.locator('svg')).toBeVisible();
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 844 });
		const heading = (await page.getByText('予想まとめ', { exact: true }).boundingBox())!;
		const prediction = (await page.getByRole('link', { name: '予想', exact: true }).boundingBox())!;
		const share = (await shareButton.boundingBox())!;
		expect(Math.abs(heading.y + heading.height / 2 - share.y - share.height / 2)).toBeLessThan(2);
		expect(prediction.x).toBeGreaterThan(heading.x + heading.width);
		expect(share.x).toBeGreaterThan(prediction.x + prediction.width);
	}
	await page.getByRole('link', { name: '予想', exact: true }).click();
	await expect(page).toHaveURL(`/races/${MARKS_RACE_ID}/preview`);
	await gotoHydrated(page, `/shared/races/${SHARED_RACE_ID}`);
	await expect(page.locator('li', { hasText: 'E2Eメモノミ' })).toContainText(
		'印は保留。距離延長での走りに注目。'
	);
	await expect(page.locator('article li .font-semibold')).toHaveText([
		'E2Eホンメイ',
		'E2Eモウイットウ',
		'E2Eタイコウ',
		'E2Eタンアナ',
		'E2Eレンシタ',
		'E2Eアナウマ',
		'E2Eケシウマ',
		'E2Eメモノミ'
	]);
});

test('予想をまとめ、公開名で共有・更新・解除できる。本名はHTMLやデータにも出ない', async ({
	page,
	browser,
	playwright
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${SUMMARY_RACE_ID}/preview`);
	await page.getByRole('link', { name: '予想をまとめて見る' }).click();
	await expect(page.getByText('まとめ用の見立て。前半はゆっくり。')).toBeVisible();
	await expect(page.getByText('まとめ用のメモ。内枠を評価。')).toBeVisible();
	await expect(page.getByTitle('予想印 ◎')).toBeVisible();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toHaveCount(0);

	await page.getByRole('link', { name: '名前を設定する' }).click();
	await page.getByLabel('公開用の名前', { exact: true }).fill('週末うまメモ');
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByText('公開用の名前を保存しました', { exact: true })).toBeVisible();
	await gotoHydrated(page, summaryPath);
	await page.getByRole('button', { name: '共有リンクを作る' }).click();
	const urlField = page.getByRole('textbox', { name: '共有リンク', exact: true });
	await expect(urlField).toBeVisible();
	await expect(page.getByRole('region', { name: 'この予想を共有' })).toBeFocused();
	const url = await urlField.inputValue();
	const guest = await playwright.request.newContext();
	const response = await guest.get(url);
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toContain('no-store');
	expect(response.headers()['x-robots-tag']).toContain('noindex');
	expect(response.headers()['referrer-policy']).toBe('no-referrer');
	const html = await response.text();
	expect(html).toContain('週末うまメモ');
	expect(html).toContain('まとめ用の見立て。前半はゆっくり。');
	expect(html).not.toMatch(/E2E ユーザー|e2e@example|googleSub|avatarUrl/);
	// 本人が開いたときもレイアウト経由でアカウント情報をシリアライズしない。
	expect(await (await page.request.get(url)).text()).not.toMatch(
		/E2E ユーザー|e2e@example|googleSub|avatarUrl/
	);
	const payload = await page.request.get(`${url}/__data.json`);
	expect(payload.status()).toBe(200);
	expect(await payload.text()).not.toMatch(/E2E ユーザー|e2e@example|googleSub|avatarUrl/);
	expect((await guest.get(new URL(`/shared/races/${SUMMARY_RACE_ID}`, url).href)).status()).toBe(
		404
	);
	expect(await (await page.request.get(`/notes/${SHARED_NOTE_ID}`)).text()).not.toMatch(
		/E2E ユーザー|e2e@example|googleSub|avatarUrl/
	);
	expect(await (await guest.get(new URL(`/notes/${SHARED_NOTE_ID}`, url).href)).text()).toContain(
		'週末うまメモ'
	);

	// 別アカウント（管理者でも）は本人の予想や共有状態を受け取れない。
	const otherContext = await browser.newContext({ baseURL: new URL(url).origin });
	const other = await otherContext.newPage();
	await login(other, 'admin');
	await gotoHydrated(other, summaryPath);
	await expect(other.getByText('まとめ用のメモ。内枠を評価。')).toHaveCount(0);
	await expect(other.getByRole('textbox', { name: '共有リンク', exact: true })).toHaveCount(0);
	const otherRevoke = await other.request.post(`${summaryPath}?/revoke`, {
		headers: { origin: new URL(url).origin },
		form: {}
	});
	expect(otherRevoke.status()).toBe(200);
	expect((await guest.get(url)).status()).toBe(200);
	await otherContext.close();

	await gotoHydrated(page, `/races/${SUMMARY_RACE_ID}/preview`);
	await page.getByText('書き直す', { exact: true }).click();
	await page.locator('textarea[name="raceNoteBody"]').fill('共有後に書き直した見立て');
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByRole('button', { name: '出走前メモを保存' })).toHaveCount(0);
	expect(await (await guest.get(url)).text()).not.toContain('共有後に書き直した見立て');
	await gotoHydrated(page, summaryPath);
	await expect(page.getByText('共有後に予想が変わっています。', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: '共有内容を更新' }).click();
	await expect(page.getByRole('status')).toContainText('共有内容を保存しました');
	expect(await (await guest.get(url)).text()).toContain('共有後に書き直した見立て');

	// Tabで共有欄から更新・解除に進み、Enterで解除できる。
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: '名前を設定する' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: '共有内容を更新' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: '共有をやめる', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(urlField).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'この予想を共有' })).toBeFocused();
	expect((await guest.get(url)).status()).toBe(404);
	await page.getByRole('button', { name: '共有リンクを作る' }).click();
	await expect(urlField).toBeVisible();
	const newUrl = await urlField.inputValue();
	expect(newUrl).not.toBe(url);
	expect((await guest.get(url)).status()).toBe(404);
	await gotoHydrated(page, '/settings/shares');
	const sharedRace = page.locator('li', { hasText: 'E2Eまとめ賞' });
	await sharedRace.getByRole('button', { name: '共有をやめる' }).click();
	await expect(sharedRace).toHaveCount(0);
	await expect(page.getByRole('heading', { name: '共有中のメモ', exact: true })).toBeFocused();
	expect((await guest.get(newUrl)).status()).toBe(404);
	await guest.dispose();
});

test('JavaScriptなしでも公開名を保存でき、空欄で既存の共有ページが匿名になる', async ({
	browser
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		baseURL: `http://localhost:${process.env.E2E_PORT ?? 4173}`
	});
	const page = await context.newPage();
	await login(page);
	await page.goto('/settings/profile');
	await page.getByLabel('公開用の名前', { exact: true }).fill('');
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByText('公開用の名前を保存しました。', { exact: true })).toBeVisible();
	await page.goto(`/shared/races/${SHARED_RACE_ID}`);
	await expect(page.getByText('匿名 の予想')).toBeVisible();
	await page.goto(summaryPath);
	// 前のテストが途中で止まっていても、この操作単体で始められる。
	if (await page.getByRole('button', { name: '共有をやめる' }).count()) {
		await page.getByRole('button', { name: '共有をやめる' }).click();
	}
	await page.getByRole('button', { name: '予想をシェア', exact: true }).click();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toBeVisible();
	await page.getByRole('button', { name: '共有をやめる' }).click();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toHaveCount(0);
	await context.close();
});

test('名前の長すぎる入力と別OriginのPOSTを拒否する', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/settings/profile');
	const input = page.getByLabel('公開用の名前', { exact: true });
	await input.evaluate((element) => element.removeAttribute('maxlength'));
	await input.fill('あ'.repeat(31));
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('30文字以内');
	for (const path of ['/settings/profile', `${summaryPath}?/share`, `${summaryPath}?/revoke`]) {
		const response = await page.request.post(path, {
			headers: { origin: 'https://example.invalid' },
			form: { publicName: 'bad' }
		});
		expect(response.status()).toBe(403);
	}
});

test('保存失敗は入力を残し、同じフォームから再試行できる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/settings/profile');
	await page.getByLabel('公開用の名前', { exact: true }).fill('保った名前');
	await failNextAction(page, '/settings/profile', {
		publicName: '保った名前',
		message: '公開用の名前の保存を確認できませんでした。時間をおいてもう一度保存してください。'
	});
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('もう一度保存');
	await expect(page.getByLabel('公開用の名前', { exact: true })).toHaveValue('保った名前');
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByText('公開用の名前を保存しました', { exact: true })).toBeVisible();
	await page.getByLabel('公開用の名前', { exact: true }).fill('');
	await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
});
