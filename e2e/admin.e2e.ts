import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { THIS_WEEK_RACES } from './seed';

/**
 * 管理画面（/settings/admin）。サイト管理者だけが開ける。
 *
 * 出走馬の取得は GitHub Actions を起動するだけで、E2E ではトークンを渡していない
 * （playwright.config.ts の `--var GITHUB_DISPATCH_TOKEN:`）。ここで見るのは、
 * 並ぶレースと、トークンが無いときに押せないこと・直接送っても頼まずに断ること。
 */

test('一般のユーザーは管理画面を開けない', async ({ page }) => {
	await login(page);
	const res = await page.goto('/settings/admin');

	expect(res?.status()).toBe(403);
	await expect(page.getByRole('heading', { name: '出走馬の取得' })).toHaveCount(0);
});

test('これからのレースが頭数とともに並び、トークンが無ければ取得ボタンは押せない', async ({
	page
}) => {
	await login(page, 'admin');
	await gotoHydrated(page, '/settings/admin');

	await expect(page.getByRole('heading', { name: '出走馬の取得' })).toBeVisible();
	await expect(page.getByText('GITHUB_DISPATCH_TOKEN）が設定されていないため')).toBeVisible();

	const settled = page.getByRole('listitem').filter({ hasText: THIS_WEEK_RACES.settled.name });
	await expect(settled.getByText('枠順あり（1頭）')).toBeVisible();
	await expect(settled.getByRole('button', { name: /出走馬を取得する$/ })).toBeDisabled();

	// 予想画面へ行ける
	await expect(settled.getByRole('link', { name: THIS_WEEK_RACES.settled.name })).toHaveAttribute(
		'href',
		`/races/${THIS_WEEK_RACES.settled.id}/preview`
	);
});

test('トークンが無いまま取得を送っても、頼まずに理由を返す', async ({ page }) => {
	await login(page, 'admin');
	await gotoHydrated(page, '/settings/admin');

	// ボタンは押せない状態で出るので、外して送る（画面を通さずに action を叩かれた場合と同じ）。
	const row = page.getByRole('listitem').filter({ hasText: THIS_WEEK_RACES.upcoming.name });
	const button = row.getByRole('button', { name: /出走馬を取得する$/ });
	await button.evaluate((b) => b.removeAttribute('disabled'));
	await button.click();

	// 結果は押した行の下に出る（画面の上に出すと、行の多い一覧では押した場所から見えない）
	await expect(row.getByRole('alert')).toHaveText(
		'出走馬の取得が設定されていません（GITHUB_DISPATCH_TOKEN）'
	);
	await expect(page.getByRole('alert')).toHaveCount(1);
	// 押したボタンからフォーカスが外れていない
	await expect(button).toBeFocused();
});

test('AI の利用量が % で並び、リセットすると 0 に戻って表示が消える', async ({ page }) => {
	await login(page, 'admin');
	await gotoHydrated(page, '/settings/admin');

	// リセット専用のユーザー（seed: 読み取り 500/500 = 100%、書き込み 50/100 = 50%）。
	// 並列で走るほかのテストと共有しない行なので、消してよい。
	const row = page.getByRole('listitem').filter({ hasText: 'E2E リセット対象' });
	await expect(row.getByText('AI 読み取り 100%・書き込み 50%')).toBeVisible();

	// 今週の行が無いユーザーには出ない
	const other = page.getByRole('listitem').filter({ hasText: 'E2E 別ユーザー' });
	await expect(other.getByText(/AI 読み取り/)).toHaveCount(0);
	await expect(other.getByRole('button', { name: /AI の利用量を 0% に戻す/ })).toHaveCount(0);

	const reset = row.getByRole('button', { name: 'E2E リセット対象 の AI の利用量を 0% に戻す' });
	const posts: string[] = [];
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('resetMcpUsage')) posts.push(r.url());
	});

	// 確かめのダイアログで「キャンセル」なら送らない（use:enhance は onsubmit の preventDefault を見ない）
	page.once('dialog', (d) => d.dismiss());
	await reset.click();
	await expect(row.getByText('AI 読み取り 100%・書き込み 50%')).toBeVisible();

	page.once('dialog', (d) => d.accept());
	await reset.click();

	// 行ごと消えるので、結果は「ユーザー」の見出しの下に出し、フォーカスもそこへ移す
	await expect(page.getByRole('status')).toHaveText(
		'E2E リセット対象 の AI の利用量を 0% に戻しました。'
	);
	await expect(row.getByText(/AI 読み取り/)).toHaveCount(0);
	await expect(reset).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'ユーザー' })).toBeFocused();
	// キャンセルした1回目は送られていない
	expect(posts).toHaveLength(1);
});

test('一般のユーザーは、AI の利用量のリセットを直接送っても断られる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/');
	const res = await page.request.post('/settings/admin?/resetMcpUsage', {
		form: { userId: '01JE2EUSER0000000000000000' },
		headers: { origin: new URL(page.url()).origin },
		maxRedirects: 0
	});
	expect(res.status()).toBe(403);

	// 消えていない
	await gotoHydrated(page, '/settings/connections');
	await expect(page.getByRole('progressbar', { name: '読み取り' })).toHaveAttribute(
		'aria-valuenow',
		/^(2[4-9]|3\d)$/
	);
});
