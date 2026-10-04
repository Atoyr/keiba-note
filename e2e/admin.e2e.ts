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

test('凍結は確かめのダイアログで OK のときだけ送り、キャンセルなら送らない', async ({ page }) => {
	await login(page, 'admin');
	await gotoHydrated(page, '/settings/admin');

	const posts: string[] = [];
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('/freeze')) posts.push(r.url());
	});

	// 凍結は戻せないので、ほかのテストと共有しない専用のユーザーで押す（e2e/seed.sql）
	const row = page.getByRole('listitem').filter({ hasText: 'E2E 凍結対象' });
	const freeze = row.getByRole('button', { name: '凍結' });

	// キャンセルなら送らない（use:enhance は onsubmit の preventDefault を見ずに送る）
	const dialog = page.waitForEvent('dialog');
	page.once('dialog', (d) => void d.dismiss());
	await freeze.click();
	expect((await dialog).message()).toContain('E2E 凍結対象 を凍結します');
	await expect(freeze).toBeFocused();

	page.once('dialog', (d) => void d.accept());
	await freeze.click();
	await expect(row.getByText('凍結済み')).toBeVisible();
	// キャンセルした1回目は送られていない（送っていれば、2回目より先に出ている）
	expect(posts).toHaveLength(1);
});
