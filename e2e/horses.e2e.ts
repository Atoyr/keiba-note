import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	BRACKET_RACE_ID,
	FILLY_HORSE_ID,
	HORSE_ID,
	OUTER_HORSE_ID,
	TIMELINE_RUN_RACES
} from './seed';

const TIMELINE = 'main ol > li';

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

	// 生年月日、性別（名前の左）、父、母・母父、所属・調教師の順。馬齢は出さない。
	const rows = page.locator('main dl');
	await expect(rows).toHaveCount(5);
	await expect(rows.nth(0)).toContainText('2020年3月15日生');
	await expect(rows.nth(1)).toContainText('牡');
	await expect(rows.nth(2)).toContainText('父 E2Eチチウマ');
	await expect(rows.nth(3)).toContainText('母 E2Eハハウマ');
	await expect(rows.nth(3)).toContainText('母父 E2Eハハチチ');
	await expect(rows.nth(4)).toContainText('美浦');
	await expect(rows.nth(4)).toContainText('調教師 E2E調教師');
	await expect(page.locator('main')).not.toContainText('牡6');
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

	await expect(page.getByRole('link', { name: /E2E特別/ })).toHaveAttribute(
		'href',
		`/races/${TIMELINE_RUN_RACES.quiet}`
	);
	await expect(page.getByRole('link', { name: /E2E未来賞/ })).toHaveAttribute(
		'href',
		`/races/${TIMELINE_RUN_RACES.future}/preview`
	);

	// 出走前メモ（ふりかえりではない）でも、着順の入ったレースならふりかえりへ。
	await page.goto(`/horses/${OUTER_HORSE_ID}`);
	await expect(page.getByRole('link', { name: /E2E枠色賞/ }).first()).toHaveAttribute(
		'href',
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
