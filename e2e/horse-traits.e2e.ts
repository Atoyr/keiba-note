import { expect, test, type Locator, type Page } from '@playwright/test';
import { succeedAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	BOTH_NOTED_HORSE_ID,
	FLOW_CROWD_RACE_ID,
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
 * 馬の特徴メモ（Issue #255。画面の言葉は「メモ」）。自分だけの、この馬についての見立て（本文と札）。
 *
 * 書く・消す・下書き・失敗のテストは、seed でメモを置いていない別々の馬で行う（並列で走っても取り合わない）。
 * 置いてあるメモ（E2Eプレビューホース・アナウマスペシャル）は読むだけで、書き換えない。
 */

const section = (page: Page) => page.locator('section[aria-labelledby="horse-trait"]');
const field = (page: Page) => page.getByLabel('メモの本文', { exact: true });
/** 読む形で出ている札（編集欄の札の選択ではなく、保存したメモの札）。 */
const badge = (page: Page, tag: string) =>
	section(page).locator('span.bg-primary\\/5', { hasText: tag });
const saveButton = (page: Page) => page.getByRole('button', { name: 'メモを保存する' });

test('馬の画面でメモを書くと、再読み込みしても残り、札だけでも保存でき、本文も札も空にして保存すると消える', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/horses/${FILLY_HORSE_ID}`);

	// 無いときは「＋ メモを書く」の1行だけ。本文の枠も説明も出さない。
	await expect(section(page).getByText('＋ メモを書く')).toBeVisible();
	await expect(section(page).getByText('まだ')).toHaveCount(0);
	await expect(field(page)).toBeHidden();

	// 札だけ（本文なし）でも保存でき、残る。
	await section(page).getByText('＋ メモを書く').click();
	await section(page).getByText('京都巧者', { exact: true }).click();
	await saveButton(page).click();
	await expect(page.getByText('メモを保存しました', { exact: true })).toBeVisible();
	await expect(field(page)).toBeHidden();
	await expect(badge(page, '京都巧者')).toBeVisible();
	await expect(section(page).locator('summary')).toBeFocused();
	await page.reload();
	await expect(badge(page, '京都巧者')).toBeVisible();

	// 本文を足す。
	await section(page).getByText('書き直す').click();
	await field(page).fill('高速馬場向き。\n外を回すと伸びる。');
	await section(page).getByText('右回り巧者', { exact: true }).click();
	await saveButton(page).click();
	await expect(section(page)).toContainText('高速馬場向き。');
	await expect(section(page)).toContainText('外を回すと伸びる。');
	await expect(badge(page, '右回り巧者')).toBeVisible();

	await page.reload();
	await expect(section(page)).toContainText('高速馬場向き。');
	await expect(badge(page, '京都巧者')).toBeVisible();
	await expect(badge(page, '右回り巧者')).toBeVisible();

	// 本文も札も空にして保存すると消える。
	await section(page).getByText('書き直す').click();
	await expect(field(page)).toHaveValue('高速馬場向き。\n外を回すと伸びる。');
	// 読む形の札は toggle イベントのあとに消える。消える前に押すと、読む形の札と選ぶ札の2つに当たる。
	await expect(badge(page, '京都巧者')).toHaveCount(0);
	await field(page).fill('');
	await section(page).getByText('京都巧者', { exact: true }).click();
	await section(page).getByText('右回り巧者', { exact: true }).click();
	await saveButton(page).click();

	await expect(page.getByText('メモを消しました', { exact: true })).toBeVisible();
	await page.reload();
	await expect(section(page).getByText('＋ メモを書く')).toBeVisible();
	await expect(section(page)).not.toContainText('高速馬場向き。');
	await expect(badge(page, '京都巧者')).toHaveCount(0);
	await section(page).getByText('＋ メモを書く').click();
	await expect(section(page).getByRole('checkbox', { name: '京都巧者' })).not.toBeChecked();
});

test('別のユーザーのメモは、馬の画面にも予想画面にも出ない', async ({ page }) => {
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

const previewRow = (page: Page, name: string) =>
	page.locator('main li[id^="entry-"]', { hasText: name });

test('予想画面で、馬名の下の行に メモのアイコン・このレースに合う札・前回の札 が並ぶ（合わない札は出ない）', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	// 予想賞は京都・芝・右・2200m。持っている札のうち、京都巧者・右回り巧者・中距離巧者が合い、東京巧者は合わない。
	const row = previewRow(page, 'E2Eプレビューホース');
	const memoRow = row.locator('[data-memo-row]');
	await expect(
		memoRow.getByRole('button', { name: 'E2Eプレビューホースのメモ', exact: true })
	).toBeVisible();
	await expect(memoRow.getByText('このレースに合う札')).toBeAttached();
	// 行の中の合う札は「巧者」を落とした短い表記で出し、元の札の名前は title に持つ。
	for (const tag of ['京都巧者', '右回り巧者', '中距離巧者']) {
		await expect(memoRow.getByTitle(tag, { exact: true })).toHaveText(tag.replace(/巧者$/, ''));
	}
	await expect(memoRow.getByTitle('東京巧者', { exact: true })).toHaveCount(0);

	// 前回の札は、名前の列の最後の段ではなく、この行に出る。
	const conclusion = memoRow.getByTitle('2026-04-26 に付けた札');
	await expect(conclusion).toContainText('前回');
	await expect(conclusion).toContainText('次走買い');

	// 並びは 馬名 → メモの行 → 騎手。
	const y = async (l: Locator) => (await l.boundingBox())!.y;
	const nameY = await y(row.locator('[data-name-row]'));
	const memoY = await y(memoRow);
	const jockeyY = await y(row.getByRole('button', { name: /E2E騎手/ }).first());
	expect(nameY).toBeLessThan(memoY);
	expect(memoY).toBeLessThan(jockeyY);
});

test('メモのアイコンを押すと本文と全部の札が開き、Esc で閉じてアイコンへ戻る。馬名を押すと基本情報だけが開く', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	const icon = page.getByRole('button', { name: 'E2Eプレビューホースのメモ', exact: true });
	await icon.click();
	const dialog = page.getByRole('dialog', { name: 'E2Eプレビューホースのメモ' });
	await expect(dialog).toContainText(TRAIT_PREVIEW_BODY[0]);
	await expect(dialog).toContainText(TRAIT_PREVIEW_BODY[1]);
	// 札は合わないもの（東京巧者）も含めて全部。
	await expect(dialog).toContainText('東京巧者');
	await expect(dialog).toContainText('京都巧者');
	await expect(dialog.getByRole('link', { name: '馬の画面へ' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(icon).toBeFocused();

	// 馬名を押したときは、基本情報だけ（メモは出ない）。
	await page.getByRole('button', { name: 'E2Eプレビューホース', exact: true }).click();
	const profile = page.getByRole('dialog', { name: 'E2Eプレビューホースの基本情報' });
	await expect(profile).toContainText('父 E2Eプレビューチチ');
	await expect(profile).not.toContainText(TRAIT_PREVIEW_BODY[0]);
	await expect(profile).not.toContainText('京都巧者');
});

test('基本情報の無い馬でも、メモがあればアイコンが出て、長い本文は枠の中でスクロールできる。馬名はリンクのまま', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);

	// 馬名は今までどおりのリンク（基本情報が無い）。
	await expect(page.getByRole('link', { name: 'アナウマスペシャル', exact: true })).toBeVisible();

	// 印見本特別は東京・芝1800m（回り未設定）。東京巧者・マイル巧者が合い、左回り巧者は回りが未設定なので出ない。
	const memoRow = previewRow(page, 'アナウマスペシャル').locator('[data-memo-row]');
	await expect(memoRow.getByTitle('東京巧者', { exact: true })).toBeVisible();
	await expect(memoRow.getByTitle('マイル巧者', { exact: true })).toBeVisible();
	await expect(memoRow.getByTitle('左回り巧者', { exact: true })).toHaveCount(0);

	const icon = page.getByRole('button', { name: 'アナウマスペシャルのメモ', exact: true });
	await icon.click();
	const dialog = page.getByRole('dialog', { name: 'アナウマスペシャルのメモ' });
	await expect(dialog).toContainText(TRAIT_ONLY_BODY_HEAD);
	await expect(dialog).toContainText('左回り巧者');

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
	await expect(icon).toBeFocused();
});

test('ふりかえり画面でも、馬名の下にメモのアイコンと合う札が出て（前回の札は出ない）、アイコンでメモが開く', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}`);

	const memoRow = page
		.locator('main li[id^="entry-"]', { hasText: 'アナウマスペシャル' })
		.locator('[data-memo-row]');
	await expect(memoRow.getByTitle('東京巧者', { exact: true })).toBeVisible();
	await expect(memoRow).not.toContainText('前回');

	const icon = page.getByRole('button', { name: 'アナウマスペシャルのメモ', exact: true });
	await icon.click();
	await expect(page.getByRole('dialog', { name: 'アナウマスペシャルのメモ' })).toContainText(
		TRAIT_ONLY_BODY_HEAD
	);
	await page.keyboard.press('Escape');
	await expect(icon).toBeFocused();
});

test('札だけのメモ・合わない札だけのメモ・メモも札も前回も無い馬の行', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${FLOW_CROWD_RACE_ID}/preview`);

	// 多頭数賞は阪神・芝2400m（回り未設定）。イナズマは札だけ（阪神巧者・長距離巧者が合う）。
	const tagsOnly = previewRow(page, 'イナズマ').locator('[data-memo-row]');
	await expect(tagsOnly.getByRole('button', { name: 'イナズマのメモ', exact: true })).toBeVisible();
	await expect(tagsOnly.getByTitle('阪神巧者', { exact: true })).toBeVisible();
	await expect(tagsOnly.getByTitle('長距離巧者', { exact: true })).toBeVisible();
	await tagsOnly.getByRole('button', { name: 'イナズマのメモ', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'イナズマのメモ' });
	await expect(dialog.locator('p[tabindex="0"]')).toHaveCount(0);
	await page.keyboard.press('Escape');

	// オーロラは合わない札（東京巧者）だけ。アイコンだけが出て、合う札のまとまりは無い。
	const unmatched = previewRow(page, 'オーロラ').locator('[data-memo-row]');
	await expect(
		unmatched.getByRole('button', { name: 'オーロラのメモ', exact: true })
	).toBeVisible();
	await expect(unmatched.getByText('このレースに合う札')).toHaveCount(0);

	// 何も無い馬には行そのものが無い（行の高さを増やさない）。
	await expect(previewRow(page, 'アカツキ').locator('[data-memo-row]')).toHaveCount(0);
});

test('予想まとめにはメモの本文を出さない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}/summary`);
	await expect(
		page.locator('article li .font-semibold:not([title])').filter({ hasText: 'アナウマスペシャル' })
	).toBeVisible();
	expect(await page.content()).not.toContain(TRAIT_ONLY_BODY_HEAD);
});

test('書きかけのメモは、近況メモの追加（本物の action で load を読み直す）のあとも欄に残る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/horses/${FILLY_HORSE_ID}`);

	await section(page).getByText('＋ メモを書く').click();
	await field(page).fill('保存していない書きかけ');

	// 近況メモの追加が成功すると load が読み直され、`form` も置き換わる。メモの欄は保存済みの値に戻らない。
	await page.getByText('＋ 近況メモを追加').click();
	const note = '書きかけ確認用の近況メモ';
	await page.getByLabel('近況メモ', { exact: true }).fill(note);
	await page.getByRole('button', { name: '追加', exact: true }).click();
	const row = page.locator('main ol > li', { hasText: note });
	await expect(row).toBeVisible();
	await expect(field(page)).toBeVisible();
	await expect(field(page)).toHaveValue('保存していない書きかけ');

	// 後始末: 近況メモを消し、下書きも捨てる。
	await row.getByTitle('メモの操作').click();
	await row.getByText('この近況メモを削除', { exact: true }).click();
	await row.getByRole('button', { name: '削除する', exact: true }).click();
	await expect(row).toHaveCount(0);
	await page.evaluate(() => localStorage.clear());
});

test('書きかけのメモは、再読み込みのあと「復元する」で開いて戻る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${OUTER_HORSE_ID}`);

	await section(page).getByText('＋ メモを書く').click();
	await field(page).fill('書きかけのメモ');
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
	await expect(field(page)).toHaveValue('書きかけのメモ');

	// 後始末: 下書きを捨てて、離れる確認も出ないようにする。
	await page.evaluate(() => localStorage.clear());
});

test('保存に失敗しても入力は残り、もう一度保存できる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${TOGGLE_FAVORITE_HORSE_ID}`);

	await section(page).getByText('＋ メモを書く').click();
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
	await expect(page.getByText('メモを保存しました', { exact: true })).toBeVisible();
	await expect(section(page)).toContainText('通信が切れても残す本文');

	// 後始末: 消す。
	await section(page).getByText('書き直す').click();
	await field(page).fill('');
	await saveButton(page).click();
	await expect(page.getByText('メモを消しました', { exact: true })).toBeVisible();
});

test.describe('JavaScriptなしのメモ', () => {
	test.use({ javaScriptEnabled: false });

	test('馬の画面で札を付けて書いて消せ、失敗は欄を開いて値・札・文を残す', async ({ page }) => {
		await login(page);
		await page.goto(`/horses/${BOTH_NOTED_HORSE_ID}`);

		await section(page).getByText('＋ メモを書く').click();
		const tooLong = '長'.repeat(10001);
		await field(page).fill(tooLong);
		await section(page).getByText('中山巧者', { exact: true }).click();
		await saveButton(page).click();
		// 失敗は SSR で開いて返り、欄に値と札と文が残る。
		await expect(field(page)).toBeVisible();
		await expect(field(page)).toHaveValue(tooLong);
		await expect(section(page).getByRole('checkbox', { name: '中山巧者' })).toBeChecked();
		await expect(page.getByRole('alert')).toContainText('10,000文字以内');

		await field(page).fill('JSなしで書いたメモ');
		await saveButton(page).click();
		// 知らせの文は `<noscript>` の中（表示の有無は端末しだい）なので、HTML に入っていることを確かめる。
		// 送信後の画面に替わるのを待ってから読む（待たずに読むと送信前の HTML を見る）。
		await expect(section(page)).toContainText('JSなしで書いたメモ');
		expect(await page.content()).toContain('メモを保存しました。');
		await expect(badge(page, '中山巧者')).toBeVisible();

		await section(page).getByText('書き直す').click();
		await field(page).fill('');
		// JS が無いと読む形が出たままなので、同じ名前の札が2つある。選択の欄は後ろ。
		await section(page).getByText('中山巧者', { exact: true }).last().click();
		await saveButton(page).click();
		await expect(section(page).getByText('＋ メモを書く')).toBeVisible();
		expect(await page.content()).toContain('メモを消しました。');
	});
});
