import { expect, test } from '@playwright/test';
import { login } from './login';
import { BRACKET_RACE_ID, EMPTY_RACE_ID } from './seed';

/**
 * レース一覧の絞り込みは GET クエリで表される。
 * **クエリが付いていても未ログインでは開けない**こと、
 * 戻り先として条件ごと保持されることを見る。
 */
test('絞り込み付きのレース一覧も未ログインでは開けず、条件ごと戻り先に残る', async ({ page }) => {
	await page.goto('/races?year=2026&grade=G1&grade=G3&q=%E8%A8%98%E5%BF%B5');

	await expect(page).toHaveURL(/\/login\?redirect=/);

	const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
	const target = new URL(redirect, page.url());
	expect(target.pathname).toBe('/races');
	expect(target.searchParams.getAll('grade')).toEqual(['G1', 'G3']);
	expect(target.searchParams.get('year')).toBe('2026');
	expect(target.searchParams.get('q')).toBe('記念');

	// 一覧の中身が漏れていないこと。
	await expect(page.getByRole('heading', { name: 'レース' })).toHaveCount(0);
});

/**
 * ふりかえり画面の保存ボタン。
 *
 * この画面は「レースのメモ + 各馬のメモ」を1送信で保存するので「まとめて保存」だが、
 * 出走馬がまだ登録されていないレースでは入力欄が1つしか無い。そこで「まとめて」と
 * 名乗ると、画面に出ていない何かも一緒に保存されるように読める。
 *
 * 文言の分岐は `raceReviewSaveLabel` の単体テストで両方見ている。ここは配線の確認。
 */
test('出走馬がいないレースの保存ボタンは「まとめて」と名乗らない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}`);

	await expect(page.getByText('出走馬がまだ登録されていません。')).toBeVisible();
	await expect(page.getByRole('button', { name: 'レースのメモを保存' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'まとめて保存' })).toHaveCount(0);
});

/**
 * 枠は色で読む。この画面は**着順で並ぶ**ので、色が無いと
 * 「内で決まったレースだったのか」がひと目で拾えない。
 * 色そのものは BracketBadge の表が持つ。ここでは札が出て、**数字も一緒に出る**ことを見る。
 */
test('出走馬の枠番が枠の札で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page.getByTitle('1枠')).toHaveText('1');
	await expect(page.getByTitle('8枠')).toHaveText('8');

	// 枠の札は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText('16');
});
