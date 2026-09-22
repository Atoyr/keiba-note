import { expect, test } from '@playwright/test';
import { login } from './login';
import { BRACKET_RACE_ID, EMPTY_RACE_ID, REVIEW_RACE_ID } from './seed';

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
 */
test('出走馬がいないレースの保存ボタンは「まとめて」と名乗らない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}`);

	await expect(page.getByText('出走馬がまだ登録されていません。')).toBeVisible();
	await expect(page.getByRole('button', { name: 'レースのメモを保存' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'まとめて保存' })).toHaveCount(0);
});

test('出走馬が並んでいれば「まとめて保存」のまま', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	await expect(page.getByRole('button', { name: 'まとめて保存' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'レースのメモを保存' })).toHaveCount(0);
});

test('ふりかえり画面は未ログインでは開けない', async ({ page }) => {
	await page.goto(`/races/${EMPTY_RACE_ID}`);

	await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(`/races/${EMPTY_RACE_ID}`)}`);
	// レース名すら出ていないこと。
	await expect(page.getByText('E2E出馬表前賞')).toHaveCount(0);
});

/**
 * 枠は色で読む。この画面は**着順で並ぶ**ので、色が無いと
 * 「内で決まったレースだったのか」がひと目で拾えない。
 * 色は JRA の帽子の色に合わせてあり、**数字も必ず一緒に出す**。
 */
test('出走馬の枠番が枠の色で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	// 1枠は白。面が背景と同じなので、輪郭が無いと消える。
	const inner = page.getByTitle('1枠');
	await expect(inner).toBeVisible();
	await expect(inner).toHaveText('1');
	await expect(inner).toHaveClass(/bg-white/);
	await expect(inner).toHaveClass(/border-gray-400/);

	// 8枠は桃。
	const outer = page.getByTitle('8枠');
	await expect(outer).toBeVisible();
	await expect(outer).toHaveText('8');
	await expect(outer).toHaveClass(/bg-pink-300/);

	// 枠の色は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText('16');
});

/** 出走馬の並んだレースでも、未ログインなら馬名まで出ないこと。 */
test('未ログインでは出走馬の名前も出ない', async ({ page }) => {
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page).toHaveURL(
		`/login?redirect=${encodeURIComponent(`/races/${BRACKET_RACE_ID}`)}`
	);
	await expect(page.getByText('E2Eウチワク')).toHaveCount(0);
});
