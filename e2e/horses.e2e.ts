import { expect, test } from '@playwright/test';
import { failNextAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	BRACKET_RACE_ID,
	FILLY_HORSE_ID,
	HORSE_ID,
	OUTER_HORSE_ID,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	TIMELINE_RUN_RACES
} from './seed';
import { expectLinkTo } from './link';

const TIMELINE = 'main ol > li';

// 出走馬の行の馬名を押す（クリック）と、基本情報を開く。hover では開かない。基本情報の無い馬はリンクのまま。
test('ふりかえり画面の馬名を押すと基本情報が開き、馬の画面へ行ける', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${REVIEW_RACE_ID}`);

	const trigger = page.getByRole('button', { name: 'E2Eテストホース', exact: true });
	await trigger.hover();
	await page.waitForTimeout(500);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('tooltip')).toHaveCount(0);

	await trigger.click();

	const dialog = page.getByRole('dialog', { name: 'E2Eテストホースの基本情報' });
	await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(dialog).toContainText('父 E2Eチチウマ');
	await expect(dialog).toContainText('母 E2Eハハウマ');
	await expect(dialog).toContainText('母父 E2Eハハチチ');
	await expect(dialog).toContainText('調教師 E2E調教師');
	await expect(dialog).toContainText('美浦');
	// 性齢・生年月日は行の札にもうある（または出さない）ので、枠には出さない。
	await expect(dialog).not.toContainText('2020');

	// Esc で閉じる。
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();

	await trigger.click();
	await dialog.getByRole('link', { name: '馬の画面へ' }).click();
	await expect(page).toHaveURL(`/horses/${HORSE_ID}`);
	await expect(page.getByRole('heading', { name: 'E2Eテストホース', level: 1 })).toBeVisible();
});

test('予想画面の馬名を押すと基本情報が開く（性も生年も無い馬でも）', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	await page.getByRole('button', { name: 'E2Eプレビューホース', exact: true }).click();

	const dialog = page.getByRole('dialog', { name: 'E2Eプレビューホースの基本情報' });
	await expect(dialog).toContainText('父 E2Eプレビューチチ');
	await expect(dialog).toContainText('母 E2Eプレビューハハ');
	await expect(dialog).toContainText('母父 E2Eプレビューハハチチ');
	await expect(dialog).toContainText('調教師 E2Eプレビュー調教師');
	await expect(dialog).toContainText('栗東');
	await dialog.getByRole('link', { name: '馬の画面へ' }).click();
	await expect(page.getByRole('heading', { name: 'E2Eプレビューホース', level: 1 })).toBeVisible();
});

test('メモを書かなかった出走もタイムラインに並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	// 何も書いていない2走が、走った事実として出ていること。
	await expect(page.getByText('新潟10R E2E特別 (3勝クラス) 5着')).toBeVisible();
	await expect(page.getByText('東京11R E2E未来賞 (G1)')).toBeVisible();
	await expect(page.getByText('出走', { exact: true })).toBeVisible();

	// メモを書いた出走は**メモの行だけ**。同じレースが2行にならないこと。
	await expect(page.getByText('中山11R E2Eステークス (G3) 3着')).toHaveCount(1);
	await expect(page.getByText('直線だけの競馬になった。')).toBeVisible();
});

test('名前の上に生年月日、名前の下に札の行が並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	// 生年月日、性齢（名前の左。今の年で変わるので数字は問わない）、父、母・母父、所属・調教師の順。
	const rows = page.locator('main dl');
	await expect(rows).toHaveCount(5);
	await expect(rows.nth(0)).toContainText('2020年3月15日生');
	await expect(rows.nth(1)).toContainText(/牡\d+/);
	await expect(rows.nth(2)).toContainText('父 E2Eチチウマ');
	await expect(rows.nth(3)).toContainText('母 E2Eハハウマ');
	await expect(rows.nth(3)).toContainText('母父 E2Eハハチチ');
	await expect(rows.nth(4)).toContainText('美浦');
	await expect(rows.nth(4)).toContainText('調教師 E2E調教師');
});

test('タイムラインは未来から過去の順に並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	const rows = page.locator(TIMELINE);

	// 先頭は出走予定（まだ走っていないので着順は出ない）。
	await expect(rows.first()).toContainText('2099-04-04');
	await expect(rows.first()).toContainText('出走予定');

	// 以降は日付の降順。過去ほど下に沈む。
	const dates = (await rows.allInnerTexts()).map((t) => t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');
	expect(dates).toEqual([...dates].sort().reverse());
	expect(dates.at(-1)).toBe('2026-06-14');

	// レースの行には、そのレース当時の馬齢（レースの年 − 生年 2020）を添える。近況メモの行には出ない。
	await expect(rows.filter({ hasText: '2026-06-14' }).first()).toContainText('6歳');
	await expect(rows.first()).toContainText('79歳');
	// レースの無い近況メモの行には出ない。
	await expect(rows.filter({ hasText: 'これは共有していないメモ。' })).not.toContainText('歳');
});

/**
 * タイムラインのリンク先も、ほかの画面と同じく結果が出たかで分ける（→ `opensReview`）。
 * 出走行はレースの着順、メモ行はメモが付いたレースの着順で決まる。
 */
test('タイムラインから、結果が出たレースはふりかえりへ、出走予定は予想画面へ行く', async ({
	page
}) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	await expectLinkTo(
		page.getByRole('link', { name: /E2E特別/ }),
		`/races/${TIMELINE_RUN_RACES.quiet}`
	);
	await expectLinkTo(
		page.getByRole('link', { name: /E2E未来賞/ }),
		`/races/${TIMELINE_RUN_RACES.future}/preview`
	);

	// 出走前メモ（ふりかえりではない）でも、着順の入ったレースならふりかえりへ。
	await page.goto(`/horses/${OUTER_HORSE_ID}`);
	await expectLinkTo(
		page.getByRole('link', { name: /E2E枠色賞/ }).first(),
		`/races/${BRACKET_RACE_ID}`
	);
});

test('admin のプロフィール編集で、所属・性別・生年月日・母父が保存される', async ({ page }) => {
	await login(page, 'admin');
	await gotoHydrated(page, `/horses/${FILLY_HORSE_ID}`);

	// 値は今の値のまま保存する（ほかのテスト・キャプチャの前提を変えない）。
	// 選択が form に載らなければ空で送られ、所属も性別も消える。
	await page.getByRole('button', { name: 'プロフィールを編集' }).click();
	await expect(page.getByLabel('生年月日')).toHaveValue('2022-05-01');
	await expect(page.getByLabel('母父')).toHaveValue('E2Eヒメハハチチ');
	await page.getByRole('button', { name: '所属', exact: true }).click();
	await page.getByRole('option', { name: '栗東' }).click();
	await page.getByRole('button', { name: '保存', exact: true }).click();

	const rows = page.locator('main dl');
	await expect(rows.nth(0)).toContainText('2022年5月1日生');
	await expect(rows.nth(1)).toContainText('牝');
	await expect(rows.nth(3)).toContainText('母父 E2Eヒメハハチチ');
	await expect(rows.nth(4)).toContainText('栗東');
	await expect(rows.nth(4)).toContainText('調教師 E2E栗東調教師');
});

test('近況メモは削除の確認を開いただけでは消えず、確定すると消える', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${HORSE_ID}`);
	await page.getByText('＋ 近況メモを追加').click();
	const body = '削除の確認テスト用の近況メモ';
	await page.getByLabel('近況メモ', { exact: true }).fill(body);
	await page.getByRole('button', { name: '追加', exact: true }).click();
	const row = page.locator(TIMELINE, { hasText: body });
	await row.getByTitle('メモの操作').click();
	await row.getByText('この近況メモを削除', { exact: true }).click();
	await expect(row.getByText(body, { exact: true })).toBeVisible();
	await expect(row.getByText('この近況メモを削除すると、元に戻せません。')).toBeVisible();
	await row.getByRole('button', { name: '削除する', exact: true }).focus();
	await page.keyboard.press('Escape');
	await row.getByTitle('メモの操作').click();
	await expect(row.getByRole('button', { name: '削除する', exact: true })).not.toBeVisible();
	await row.getByText('この近況メモを削除', { exact: true }).click();
	await row.getByRole('button', { name: '削除する', exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'タイムライン', exact: true })).toBeFocused();
	await expect(page.getByText('近況メモを削除しました', { exact: true })).toBeVisible();
});

test('近況メモの追加失敗では入力とエラーを残す', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${HORSE_ID}`);
	await page.getByText('＋ 近況メモを追加').click();
	await page.getByLabel('近況メモ', { exact: true }).fill('失敗しても残す本文');
	await failNextAction(page, `/horses/${HORSE_ID}`, { message: '追加できませんでした' });
	await page.getByRole('button', { name: '追加', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('追加できませんでした');
	await expect(page.getByLabel('近況メモ', { exact: true })).toHaveValue('失敗しても残す本文');
});

test('近況追加は送信中を示し、二重送信しない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/horses/${HORSE_ID}`);
	await page.getByText('＋ 近況メモを追加').click();
	await page.getByLabel('近況メモ', { exact: true }).fill('送信中の本文');
	let requests = 0;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(
		(url) => url.pathname === `/horses/${HORSE_ID}`,
		async (route) => {
			if (route.request().method() !== 'POST') return route.continue();
			requests++;
			await gate;
			await route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({
					type: 'failure',
					status: 400,
					data: JSON.stringify([{ message: 1 }, 'テスト用の失敗'])
				})
			});
		}
	);
	await page.getByRole('button', { name: '追加', exact: true }).click();
	const pending = page.getByRole('button', { name: '処理中…', exact: true });
	await expect(pending).toHaveAttribute('aria-disabled', 'true');
	await pending.evaluate((button: HTMLButtonElement) => button.form!.requestSubmit(button));
	await expect.poll(() => requests).toBe(1);
	release();
	await expect(page.getByRole('button', { name: '追加', exact: true })).toHaveAttribute(
		'aria-disabled',
		'false'
	);
});
