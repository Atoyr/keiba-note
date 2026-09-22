import { expect, test } from '@playwright/test';
import { login } from './login';
import { PREVIEW_RACE_ID } from './seed';

test('未ログインでは予想画面を開けない', async ({ page }) => {
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page).toHaveURL(
		`/login?redirect=${encodeURIComponent(`/races/${PREVIEW_RACE_ID}/preview`)}`
	);
	// 出走前メモの中身が1文字も漏れていないこと。
	await expect(page.getByText('今回は内枠が向きそう。')).toHaveCount(0);
});

/**
 * この画面の用は「16頭を見比べる」ことなので、**自分の出走前メモは開かずに読める**
 * のが正。畳まれていた頃は1頭ずつ開かないと自分の見解が見えなかった。
 */
test('書いた出走前メモは、開かなくても本文と付けた札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 何も開いていない状態で、本文と付けた札の両方が畳まれた見出しに出ていること。
	// 札の名前は TagPicker 側にも（伏せた状態で）あるので、summary に絞って見る。
	const summary = page.locator('main summary');
	await expect(summary).toContainText('今回は内枠が向きそう。');
	await expect(summary).toContainText('次走買い');

	// 選んでいない札（TagPicker の全選択肢）は伏せたまま。
	// こちらは TagBadges に出ないので、画面に1つしか無い＝そのまま見に行ける。
	await expect(page.getByText('好上がり', { exact: true })).toBeHidden();
	// 本文の入力欄も畳まれている（畳むのは書く側だけ）。
	await expect(page.getByRole('textbox')).toBeHidden();
});

test('「書き直す」を開くと、本文欄と全部の札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await page.getByText('書き直す', { exact: true }).click();

	// 入力欄には保存済みの本文が入っている。
	await expect(page.getByRole('textbox')).toHaveValue('今回は内枠が向きそう。');
	// 選んでいない札もここで初めて出る（付け足せる）。
	await expect(page.getByText('好上がり', { exact: true })).toBeVisible();
	// 付けた札はチェック済みで出る。
	await expect(page.getByRole('checkbox', { name: '次走買い' })).toBeChecked();
});

/**
 * 枠は色で読む。ふりかえり画面と同じ札を使うので、**予想で見た枠と
 * 結果で見る枠が別物に見えない**ことを、こちら側でも1本押さえておく。
 */
test('出走馬の枠番が枠の色で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	const bracket = page.getByTitle('2枠');
	await expect(bracket).toBeVisible();
	await expect(bracket).toHaveText('2');
	await expect(bracket).toHaveClass(/bg-gray-900/);

	// 枠の色は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main > form > ul > li').first();
	await expect(row).toContainText('3');
});
