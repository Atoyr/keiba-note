import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GoogleLogin from './GoogleLogin.svelte';

describe('GoogleLogin', () => {
	it('戻り先がトップなら redirect を送らない', async () => {
		const screen = render(GoogleLogin, {});

		await expect.element(screen.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
		expect(screen.container.querySelector('input[name="redirect"]')).toBeNull();
	});

	it('戻り先があれば redirect に載せて送る', () => {
		const screen = render(GoogleLogin, { redirectTo: '/races' });

		expect(screen.container.querySelector('input[name="redirect"]')).toHaveProperty(
			'value',
			'/races'
		);
	});

	// 規約はログインで同意したものとするので、ボタンのそばに同意の文とリンクが要る。
	it('規約とポリシーへのリンクを添える', async () => {
		const screen = render(GoogleLogin, {});

		await expect.element(screen.getByText(/に同意したことになります/)).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: '利用規約' }))
			.toHaveAttribute('href', '/terms');
		await expect
			.element(screen.getByRole('link', { name: 'プライバシーポリシー' }))
			.toHaveAttribute('href', '/privacy');
	});
});
