import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import favicon from '$lib/assets/favicon.svg';
import faviconStaging from '$lib/assets/favicon-staging.svg';
import AppEnvMark from './AppEnvMark.svelte';

/** テストの実行ページにも vitest 自身のアイコンがあるので、あとから足された最後のものを見る。 */
const iconHref = () =>
	Array.from(document.head.querySelectorAll('link[rel="icon"]')).at(-1)?.getAttribute('href') ?? '';
const touchIconHref = () =>
	document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? '';

describe('AppEnvMark', () => {
	it('本番では帯を出さず、紺のアイコンにする', async () => {
		const screen = render(AppEnvMark, { staging: false });

		await expect.element(screen.getByText(/ステージング/)).not.toBeInTheDocument();
		// 小さい SVG は Vite が data URL に埋め込むので、ファイル名ではなく import した値と比べる。
		expect(iconHref()).toBe(favicon);
		expect(touchIconHref()).toMatch(/\/apple-touch-icon\.png$/);
	});

	it('ステージングでは帯を出し、灰色のアイコンにする', async () => {
		const screen = render(AppEnvMark, { staging: true });

		await expect.element(screen.getByText('ステージング環境（データは本番と別）')).toBeVisible();
		expect(iconHref()).toBe(faviconStaging);
		expect(touchIconHref()).toMatch(/\/apple-touch-icon-staging\.png$/);
	});
});
