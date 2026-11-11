import { expect, test } from '@playwright/test';
import {
	BRACKET_RACE_ID,
	DASHBOARD_RACES,
	EMPTY_RACE_ID,
	HORSE_ID,
	JOCKEYS,
	PREVIEW_RACE_ID,
	SHARED_NOTE_ID
} from './seed';
import { login } from './login';

test('未ログインのトップは紹介ページで、ダッシュボードの中身は出ない', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1, name: 'uma-memo' })).toBeVisible();
	// 入口はページの先頭と末尾の2か所にある。
	await expect(page.getByRole('button', { name: 'Google でログイン' }).first()).toBeVisible();

	// `/` は誰でも開ける。seed のメモやレースが1文字も漏れていないこと。
	await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toHaveCount(0);
	await expect(page.getByText(DASHBOARD_RACES.thisWeek)).toHaveCount(0);
});

test('ログイン画面にもログインの入口がある', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	await expect(page.getByText('メモは既定で非公開')).toBeVisible();
});

test('プライバシーポリシーと利用規約は未ログインで読め、紹介ページとログイン画面から辿れる', async ({
	page
}) => {
	// Google の同意画面に URL を登録するページ。ログインへ飛ばされると登録できない。
	await page.goto('/');
	await page.getByRole('link', { name: 'プライバシーポリシー' }).first().click();
	await expect(page).toHaveURL('/privacy');

	await page.goto('/login');
	await page.getByRole('link', { name: 'プライバシーポリシー' }).click();
	await expect(page).toHaveURL('/privacy');
	await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();

	await page.goto('/login');
	await page.getByRole('link', { name: '利用規約' }).click();
	await expect(page).toHaveURL('/terms');
	await expect(page.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible();
});

/**
 * 認証は hooks.server.ts の `PUBLIC_PATHS` 以外を一律で弾く作り。画面ごとに
 * テストを分けても同じ分岐を通るだけなので、ここに1行ずつ足していく。
 *
 * 見ているのは2つ。行き先が redirect に持ち越されること（ログイン後に戻れる）と、
 * seed に入れた中身が1文字も漏れていないこと。**画面を足したらここに1行足す。**
 */
const PROTECTED: { path: string; secret: string | null }[] = [
	// `/` は紹介ページのために完全一致で公開している。その下まで開いていないこと。
	{ path: '/races', secret: null },
	{ path: '/this-week', secret: null },
	{ path: '/help/webmcp', secret: 'WebMCPの使い方' },
	{ path: '/help/mcp', secret: 'AIとの連携の始め方' },
	{ path: '/settings/shares', secret: null },
	{ path: '/settings/profile', secret: null },
	{ path: '/settings/insight-words', secret: null },
	// MCP の連携の一覧と同意画面。同意はログインした本人だけができる（PUBLIC_PATHS に入れない）。
	{ path: '/settings/connections', secret: 'E2E クライアント' },
	{ path: '/oauth/authorize', secret: null },
	{ path: `/races/${PREVIEW_RACE_ID}/summary`, secret: '今回は内枠が向きそう。' },
	{ path: '/settings/admin', secret: null },
	{ path: `/horses/${HORSE_ID}`, secret: 'E2E未来賞' },
	{ path: '/graded-races', secret: null },
	{ path: '/graded-races/xxx', secret: null },
	{ path: '/jockeys', secret: null },
	{ path: `/jockeys/${encodeURIComponent(JOCKEYS.main)}`, secret: JOCKEYS.mainSummary },
	{ path: `/races/${BRACKET_RACE_ID}`, secret: 'E2Eウチワク' },
	// 開催前のレースは予想画面へ振り分けられる。**認証がその振り分けより先に効く**ことを見る
	// （追い越されると redirect が /preview になり、未ログインのまま中身が出る）。
	{ path: `/races/${EMPTY_RACE_ID}`, secret: 'E2E出馬表前賞' },
	{ path: `/races/${PREVIEW_RACE_ID}/preview`, secret: '今回は内枠が向きそう。' }
];

for (const { path, secret } of PROTECTED) {
	test(`未ログインでは ${path} を開けず、行き先が redirect に残る`, async ({ page }) => {
		await page.goto(path);

		await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(path)}`);
		if (secret) await expect(page.getByText(secret)).toHaveCount(0);
	});
}

test('ログイン済みで /login?redirect= に抜け道のパスを渡しても、外のオリジンへは飛ばない', async ({
	page
}) => {
	await login(page);
	// 符号化したタブ（/%09/evil.com）は復号されて `/<TAB>/evil.com` になり、
	// ブラウザの URL 解析で `//evil.com` になる。`safeRedirect` が `/` に落とす。
	for (const redirect of ['/%09/evil.com', '/%0a/evil.com', '/%5Cevil.com', '/..//evil.com']) {
		const res = await page.request.get(`/login?redirect=${redirect}`, { maxRedirects: 0 });
		expect(res.status()).toBe(302);
		expect(res.headers()['location']).toBe('/');
	}
});

test('応答に共通のセキュリティヘッダが付き、共有ページの no-referrer は残る', async ({ page }) => {
	await login(page);
	const home = await page.request.get('/');
	expect(home.headers()['x-content-type-options']).toBe('nosniff');
	expect(home.headers()['x-frame-options']).toBe('DENY');
	expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(home.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');

	const shared = await page.request.get(`/notes/${SHARED_NOTE_ID}`);
	expect(shared.status()).toBe(200);
	expect(shared.headers()['x-content-type-options']).toBe('nosniff');
	expect(shared.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(shared.headers()['referrer-policy']).toBe('no-referrer');
});
