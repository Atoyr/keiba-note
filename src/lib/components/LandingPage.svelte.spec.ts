import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LandingPage from './LandingPage.svelte';

describe('LandingPage', () => {
	it('アプリ名とログインの入口を出す', async () => {
		const screen = render(LandingPage, {});

		await expect.element(screen.getByRole('heading', { level: 1, name: 'uma-memo' })).toBeVisible();
		// 先頭と、読み終えたところ（ページの下）の2か所。
		expect(screen.getByRole('button', { name: 'Google でログイン' }).elements()).toHaveLength(2);
		await expect
			.element(screen.getByRole('button', { name: 'Google でログイン' }).first())
			.toBeVisible();
	});

	it('使う順の3段階を見出しに出し、目次からそれぞれへ飛べる', async () => {
		const screen = render(LandingPage, {});

		const stages = [
			['before', '出馬表を見ながら予想する'],
			['after', '走りをふりかえる'],
			['next', '書いたことを次に活かす']
		] as const;
		const nav = screen.getByRole('navigation', { name: '使い方の流れ' });
		for (const [id, title] of stages) {
			await expect.element(screen.getByRole('heading', { level: 2, name: title })).toBeVisible();
			expect(screen.container.querySelector(`section#${id}`)).not.toBeNull();
			await expect
				.element(nav.getByRole('link', { name: new RegExp(title) }))
				.toHaveAttribute('href', `#${id}`);
		}
	});

	// キャプチャは読み上げでも中身が分かるように alt を付け、読み込みで文がずれないよう大きさを持たせる。
	it('機能ごとのキャプチャに説明と大きさがある', async () => {
		const screen = render(LandingPage, {});

		const imgs = [...screen.container.querySelectorAll('img')];
		expect(imgs).toHaveLength(7);
		for (const img of imgs) {
			expect(img.alt.length, img.src).toBeGreaterThan(10);
			expect(Number(img.getAttribute('width')), img.src).toBeGreaterThan(0);
			expect(Number(img.getAttribute('height')), img.src).toBeGreaterThan(0);
		}
		// 機能の見出しは h3 で、キャプチャと同じ数だけある。
		expect(screen.getByRole('heading', { level: 3 }).elements()).toHaveLength(7);
	});

	// Google の同意画面は、ホームページからポリシーへのリンクを求める。
	it('ページの下にも規約とポリシーへのリンクがある', async () => {
		const screen = render(LandingPage, {});

		const footer = screen.container.querySelector('footer');
		expect(footer?.querySelector('a[href="/terms"]')).not.toBeNull();
		expect(footer?.querySelector('a[href="/privacy"]')).not.toBeNull();
	});
});
