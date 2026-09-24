import { expect, test } from '@playwright/test';
import { login } from './login';
import { PREVIEW_RACE_ID } from './seed';

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

test('コース図は /_app/immutable/ の別ファイルとして、immutable で返す', async ({
	page,
	request
}) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);
	const img = page.getByRole('img', { name: '京都競馬場のコース図（芝）' });
	// JS に埋め込まれた data: URI ではなく、名前にハッシュの付いたファイルであること。
	const src = await img.getAttribute('src');
	expect(src).toMatch(/\/_app\/immutable\/assets\/kyoto-turf\.[\w-]+\.svg$/);
	// 画像として読めている（壊れた画像のアイコンになっていない）。
	await expect
		.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
		.toBeGreaterThan(0);

	const res = await request.get(new URL(src!, page.url()).pathname);

	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/svg+xml');
	expect(res.headers()['cache-control']).toContain('immutable');
});
