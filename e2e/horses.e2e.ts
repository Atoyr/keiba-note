import { expect, test } from '@playwright/test';
import { login } from './login';
import { BRACKET_RACE_ID, HORSE_ID, OUTER_HORSE_ID, TIMELINE_RUN_RACES } from './seed';

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
