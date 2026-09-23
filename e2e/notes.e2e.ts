import { expect, test } from '@playwright/test';
import { PRIVATE_NOTE_ID, SHARED_NOTE_ID } from './seed';

/**
 * 共有ページは**未ログインで到達できる唯一のルート**なので、
 * 本番ビルドのまま中身を確かめられる数少ない画面。
 *
 * 見たいのは、札（`note.tags`）が JSON から読み戻されて画面に出ること。
 * ここが壊れると「★を札に置き換えた」変更そのものが成立していない。
 */
test('共有されたメモは未ログインで開けて、付けた札が出る', async ({ page }) => {
	const res = await page.goto(`/notes/${SHARED_NOTE_ID}`);

	await expect(page).not.toHaveURL(/\/login/);
	// 要件「検索することはできない」。中身が出るページにこそ noindex が要る。
	expect(res?.headers()['x-robots-tag']).toContain('noindex');

	await expect(page.getByText('直線で外に出してから一完歩が速い。')).toBeVisible();
	await expect(page.getByText('次走買い', { exact: true })).toBeVisible();
	await expect(page.getByText('不利', { exact: true })).toBeVisible();
	// 付けていない札は出ない（全選択肢を並べてしまっていないこと）。
	await expect(page.getByText('好上がり', { exact: true })).toHaveCount(0);
});

/** 403 にすると存在が漏れる。存在しない ID と同じ 404 を返すこと。 */
test('非公開のメモは、行があっても 404（存在を漏らさない）', async ({ page }) => {
	const res = await page.goto(`/notes/${PRIVATE_NOTE_ID}`);

	expect(res?.status()).toBe(404);
	// 本文も札も出ていないこと。
	await expect(page.getByText('次走消し', { exact: true })).toHaveCount(0);
});
