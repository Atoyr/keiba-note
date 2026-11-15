import { expect, test, type Page } from '@playwright/test';
import { succeedAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	BOTH_NOTED_HORSE_ID,
	FILLY_HORSE_ID,
	MARKS_RACE_ID,
	OTHER_USER_TRAIT_BODIES,
	OUTER_HORSE_ID,
	PREVIEW_RACE_ID,
	TOGGLE_FAVORITE_HORSE_ID,
	TRAIT_HORSE_ID,
	TRAIT_ONLY_BODY_HEAD,
	TRAIT_PREVIEW_BODY
} from './seed';

/**
 * 馬の特徴メモ（Issue #255）。自分だけの、この馬についての見立て。
 *
 * 書く・消す・下書き・失敗のテストは、seed でメモを置いていない別々の馬で行う（並列で走っても取り合わない）。
 * 置いてあるメモ（E2Eプレビューホース・アナウマスペシャル）は読むだけで、書き換えない。
 */

const section = (page: Page) => page.locator('section[aria-labelledby="horse-trait"]');
const field = (page: Page) => page.getByLabel('特徴メモの本文', { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: '特徴メモを保存する' });

test('馬の画面で特徴メモを書くと、再読み込みしても残り、空にして保存すると消える', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/horses/${FILLY_HORSE_ID}`);

	// 無いときは「＋ 特徴メモを書く」の1行だけ。本文の枠も説明も出さない。
	await expect(section(page).getByText('＋ 特徴メモを書く')).toBeVisible();
	await expect(section(page).getByText('まだ')).toHaveCount(0);
	await expect(field(page)).toBeHidden();

	await section(page).getByText('＋ 特徴メモを書く').click();
	await field(page).fill('高速馬場向き。\n外を回すと伸びる。');
	await saveButton(page).click();

	await expect(page.getByText('特徴メモを保存しました', { exact: true })).toBeVisible();
	// 保存したら閉じて、書いたものが読む形で出る。フォーカスは開閉のボタンへ戻る。
	await expect(field(page)).toBeHidden();
	await expect(section(page)).toContainText('高速馬場向き。');
	await expect(section(page)).toContainText('外を回すと伸びる。');
	await expect(section(page).locator('summary')).toBeFocused();

	await page.reload();
	await expect(section(page)).toContainText('高速馬場向き。');
	await expect(section(page).getByText('書き直す')).toBeVisible();

	await section(page).getByText('書き直す').click();
	await expect(field(page)).toHaveValue('高速馬場向き。\n外を回すと伸びる。');
	await field(page).fill('');
	await saveButton(page).click();

	await expect(page.getByText('特徴メモを消しました', { exact: true })).toBeVisible();
	await page.reload();
	await expect(section(page).getByText('＋ 特徴メモを書く')).toBeVisible();
	await expect(section(page)).not.toContainText('高速馬場向き。');
});

test('別のユーザーの特徴メモは、馬の画面にも予想画面にも出ない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${TRAIT_HORSE_ID}`);
	await expect(section(page)).toContainText(TRAIT_PREVIEW_BODY[0]);
	await expect(section(page)).toContainText(TRAIT_PREVIEW_BODY[1]);

	for (const path of [
		`/horses/${TRAIT_HORSE_ID}`,
		`/races/${PREVIEW_RACE_ID}/preview`,
		`/races/${MARKS_RACE_ID}/preview`,
		`/races/${MARKS_RACE_ID}`
	]) {
		await page.goto(path);
		const html = await page.content();
		for (const other of OTHER_USER_TRAIT_BODIES) expect(html).not.toContain(other);
	}
});

test('予想画面で、特徴メモのある馬の名前を押すと本文が開く（基本情報もあれば札も）', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	const trigger = page.getByRole('button', {
		name: /^E2Eプレビューホース\s*（特徴メモあり）$/
	});
	// 特徴メモのある馬の名前には、アイコンが付く（読み上げの名前は変えない）。
	await expect(trigger.locator('svg[aria-hidden="true"]')).toHaveCount(1);
	await trigger.click();

	const dialog = page.getByRole('dialog', { name: 'E2Eプレビューホースの特徴メモと基本情報' });
	await expect(dialog).toContainText(TRAIT_PREVIEW_BODY[0]);
	await expect(dialog).toContainText(TRAIT_PREVIEW_BODY[1]);
	await expect(dialog).toContainText('父 E2Eプレビューチチ');
	// メモが先、札が後。
	const text = (await dialog.textContent()) ?? '';
	expect(text.indexOf(TRAIT_PREVIEW_BODY[0])).toBeLessThan(text.indexOf('E2Eプレビューチチ'));

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
});

test('基本情報の無い馬でも、特徴メモがあれば名前を押して開き、長い本文は枠の中でスクロールできる', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);

	const trigger = page.getByRole('button', {
		name: /^アナウマスペシャル\s*（特徴メモあり）$/
	});
	await trigger.click();

	const dialog = page.getByRole('dialog', { name: 'アナウマスペシャルの特徴メモ' });
	await expect(dialog).toContainText(TRAIT_ONLY_BODY_HEAD);
	await expect(dialog.getByRole('link', { name: '馬の画面へ' })).toBeVisible();

	const body = dialog.locator('p[tabindex="0"]');
	const { scrollHeight, clientHeight } = await body.evaluate((el) => ({
		scrollHeight: el.scrollHeight,
		clientHeight: el.clientHeight
	}));
	expect(scrollHeight).toBeGreaterThan(clientHeight);
	await body.focus();
	await expect(body).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();

	// 特徴メモの無い馬は、基本情報も無ければ今までどおりのリンクのまま。
	await expect(page.getByRole('link', { name: 'E2Eホンメイ', exact: true })).toBeVisible();
});

test('ふりかえり画面でも、特徴メモのある馬の名前を押すと本文が開く', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}`);

	const trigger = page.getByRole('button', {
		name: /^アナウマスペシャル\s*（特徴メモあり）$/
	});
	await trigger.click();
	await expect(page.getByRole('dialog', { name: 'アナウマスペシャルの特徴メモ' })).toContainText(
		TRAIT_ONLY_BODY_HEAD
	);

	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
});

test('予想まとめには特徴メモの本文を出さない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}/summary`);
	await expect(
		page.locator('article li .font-semibold:not([title])').filter({ hasText: 'アナウマスペシャル' })
	).toBeVisible();
	expect(await page.content()).not.toContain(TRAIT_ONLY_BODY_HEAD);
});

test('書きかけの特徴メモは、再読み込みのあと「復元する」で開いて戻る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${OUTER_HORSE_ID}`);

	await section(page).getByText('＋ 特徴メモを書く').click();
	await field(page).fill('書きかけの特徴メモ');
	// 下書きは入力から少し遅れて書く（DraftKeeper）。書かれるまで待つ。
	await expect
		.poll(() =>
			page.evaluate(() =>
				Object.keys(localStorage).some((k) => k.startsWith('uma-memo:draft:horse-trait:'))
			)
		)
		.toBe(true);

	page.once('dialog', (d) => void d.accept());
	await gotoHydrated(page, `/horses/${OUTER_HORSE_ID}`);

	// 閉じた `<details>` の外に帯が出る。押すまでは何も流し込まない。
	await expect(page.getByText('保存されていない下書きがあります')).toBeVisible();
	await expect(field(page)).toBeHidden();

	await page.getByRole('button', { name: '復元する' }).click();
	await expect(field(page)).toBeVisible();
	await expect(field(page)).toHaveValue('書きかけの特徴メモ');

	// 後始末: 下書きを捨てて、離れる確認も出ないようにする。
	await page.evaluate(() => localStorage.clear());
});

test('保存に失敗しても入力は残り、もう一度保存できる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${TOGGLE_FAVORITE_HORSE_ID}`);

	await section(page).getByText('＋ 特徴メモを書く').click();
	await field(page).fill('通信が切れても残す本文');

	// 通信の失敗（エラー画面に移らず、入力も消えない）。
	await page.route(
		(url) => url.pathname === `/horses/${TOGGLE_FAVORITE_HORSE_ID}`,
		(route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()),
		{ times: 1 }
	);
	await saveButton(page).click();
	await expect(page.getByRole('alert')).toContainText('保存できませんでした');
	await expect(field(page)).toHaveValue('通信が切れても残す本文');

	// 入力の誤り（10,000字超）はサーバーが断り、文はボタンの横に出て、入力は残る。
	const tooLong = '長'.repeat(10001);
	await field(page).fill(tooLong);
	await saveButton(page).click();
	await expect(page.getByRole('alert')).toContainText('10,000文字以内');
	await expect(field(page)).toHaveValue(tooLong);

	// 400 のあと、ほかの action（推し）が成功して `form` が置き換わっても、書きかけは保存済みの本文に戻らない。
	// 推しの切り替えは DB を変えないよう、成功の応答を1回だけ返す。
	await succeedAction(page, `/horses/${TOGGLE_FAVORITE_HORSE_ID}`, { favorite: true }, 1);
	await page.getByRole('button', { name: /^推し(にする|から外す)$/ }).click();
	await expect(page.getByText('推しにしました')).toBeVisible();
	await expect(field(page)).toHaveValue(tooLong);

	// もう一度保存できる。
	await field(page).fill('通信が切れても残す本文');
	await saveButton(page).click();
	await expect(page.getByText('特徴メモを保存しました', { exact: true })).toBeVisible();
	await expect(section(page)).toContainText('通信が切れても残す本文');

	// 後始末: 消す。
	await section(page).getByText('書き直す').click();
	await field(page).fill('');
	await saveButton(page).click();
	await expect(page.getByText('特徴メモを消しました', { exact: true })).toBeVisible();
});

test.describe('JavaScriptなしの特徴メモ', () => {
	test.use({ javaScriptEnabled: false });

	test('馬の画面で書いて消せ、失敗は欄を開いて値と文を残す', async ({ page }) => {
		await login(page);
		await page.goto(`/horses/${BOTH_NOTED_HORSE_ID}`);

		await section(page).getByText('＋ 特徴メモを書く').click();
		const tooLong = '長'.repeat(10001);
		await field(page).fill(tooLong);
		await saveButton(page).click();
		// 失敗は SSR で開いて返り、欄に値と文が残る。
		await expect(field(page)).toBeVisible();
		await expect(field(page)).toHaveValue(tooLong);
		await expect(page.getByRole('alert')).toContainText('10,000文字以内');

		await field(page).fill('JSなしで書いた特徴メモ');
		await saveButton(page).click();
		// 知らせの文は `<noscript>` の中（表示の有無は端末しだい）なので、HTML に入っていることを確かめる。
		expect(await page.content()).toContain('特徴メモを保存しました。');
		await expect(section(page)).toContainText('JSなしで書いた特徴メモ');

		await section(page).getByText('書き直す').click();
		await field(page).fill('');
		await saveButton(page).click();
		expect(await page.content()).toContain('特徴メモを消しました。');
		await expect(section(page).getByText('＋ 特徴メモを書く')).toBeVisible();
	});
});
