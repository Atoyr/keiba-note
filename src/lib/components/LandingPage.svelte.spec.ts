import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LandingPage from './LandingPage.svelte';

describe('LandingPage', () => {
	it('アプリ名とログインの入口を出す', async () => {
		const screen = render(LandingPage, {});

		await expect.element(screen.getByRole('heading', { level: 1, name: 'uma-memo' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
	});

	// Google の同意画面は、ホームページからポリシーへのリンクを求める。
	it('ページの下にも規約とポリシーへのリンクがある', async () => {
		const screen = render(LandingPage, {});

		const footer = screen.container.querySelector('footer');
		expect(footer?.querySelector('a[href="/terms"]')).not.toBeNull();
		expect(footer?.querySelector('a[href="/privacy"]')).not.toBeNull();
	});
});
