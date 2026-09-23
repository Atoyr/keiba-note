import { expect, test } from '@playwright/test';

/**
 * ビルドしたアセットのキャッシュ（docs/architecture.md 3-5）。
 * 見つかったものは1年置かせ、見つからない 404 は置かせない。
 * 404 まで immutable だと、デプロイの切り替わりに当たったブラウザが画面を直せなくなる。
 */
test('/_app/immutable/ に無いファイルの 404 はキャッシュさせない', async ({ request }) => {
	const res = await request.get('/_app/immutable/chunks/does-not-exist.js');

	expect(res.status()).toBe(404);
	expect(res.headers()['cache-control']).toBe('no-store');
});

test('/_app/immutable/ にあるファイルは immutable で返す', async ({ page, request }) => {
	await page.goto('/login');
	const src = await page.locator('link[rel="modulepreload"]').first().getAttribute('href');
	expect(src).toContain('/_app/immutable/');

	const res = await request.get(new URL(src!, page.url()).pathname);

	expect(res.status()).toBe(200);
	expect(res.headers()['cache-control']).toContain('immutable');
});
