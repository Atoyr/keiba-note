import { expect, test } from '@playwright/test';
import { login } from './login';

/**
 * 死活監視（GitHub Actions の health.yml が外から叩く。docs/monitoring.md）。
 * ログイン無しで通ること、状態以外を返さないこと、キャッシュさせないことを見る。
 */
test('/api/health は未ログインで 200 と {"status":"ok"} だけを返す', async ({ request }) => {
	const res = await request.get('/api/health', { maxRedirects: 0 });

	expect(res.status()).toBe(200);
	expect(res.headers()['cache-control']).toBe('no-store');
	expect(await res.json()).toEqual({ status: 'ok' });
});

test('/api/health のほかの /api/ は公開していない', async ({ request }) => {
	const res = await request.get('/api/other', { maxRedirects: 0 });

	expect(res.status()).toBe(302);
	expect(res.headers()['location']).toMatch(/^\/login\?redirect=/);
});

test('開発用の通知テスト（/dev/notify-test）は本番ビルドでは 404', async ({ page }) => {
	// 外から Discord への通知を起こせないこと。ログインしていても dev ガードで 404 になる。
	await login(page);
	const res = await page.request.post('/dev/notify-test', { maxRedirects: 0 });

	expect(res.status()).toBe(404);
});
