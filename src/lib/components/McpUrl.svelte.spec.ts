import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import McpUrl from './McpUrl.svelte';

const URL_ = 'https://uma-memo.example/mcp';

afterEach(() => vi.restoreAllMocks());

describe('McpUrl', () => {
	it('接続先の URL とコピーのボタンを出す', async () => {
		const screen = render(McpUrl, { url: URL_ });

		await expect.element(screen.getByText(URL_)).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'URL をコピー' })).toBeVisible();
	});

	it('押すと URL をクリップボードに入れ、ボタンの文言でコピーしたと示す', async () => {
		const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const screen = render(McpUrl, { url: URL_ });

		await screen.getByRole('button', { name: 'URL をコピー' }).click();

		expect(write).toHaveBeenCalledWith(URL_);
		await expect.element(screen.getByRole('button', { name: 'コピーしました' })).toBeVisible();
	});

	it('コピーできなければ URL を選んだ状態にし、手でコピーするよう知らせる', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const screen = render(McpUrl, { url: URL_ });

		await screen.getByRole('button', { name: 'URL をコピー' }).click();

		await expect.element(screen.getByRole('alert')).toHaveTextContent(/コピーできませんでした/);
		expect(window.getSelection()?.toString().trim()).toBe(URL_);
	});
});
