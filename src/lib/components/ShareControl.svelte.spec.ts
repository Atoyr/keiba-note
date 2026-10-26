import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShareControl from './ShareControl.svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('https://uma-memo.example/') } }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
afterEach(() => vi.restoreAllMocks());

it('共有リンクに名前があり、コピー失敗と手動でのコピー方法を残す', async () => {
	vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
	const screen = render(ShareControl, { noteId: 'note1', visibility: 'unlisted', redirectTo: '/' });
	await expect
		.element(screen.getByRole('textbox', { name: '共有リンク' }))
		.toHaveValue('https://uma-memo.example/notes/note1');
	await screen.getByRole('button', { name: 'コピー', exact: true }).click();
	await expect
		.element(screen.getByRole('status'))
		.toHaveTextContent('コピーできませんでした。リンクの欄を選んでコピーしてください。');
});

it('コピー成功をボタンと読み上げの通知で知らせる', async () => {
	vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
	const screen = render(ShareControl, { noteId: 'note1', visibility: 'unlisted', redirectTo: '/' });
	await screen.getByRole('button', { name: 'コピー', exact: true }).click();
	await expect.element(screen.getByRole('button', { name: 'コピーしました' })).toBeVisible();
	await expect.element(screen.getByRole('status')).toHaveTextContent('コピーしました');
	await expect.element(screen.getByRole('status')).toHaveTextContent('', { timeout: 2500 });
	await expect.element(screen.getByRole('button', { name: 'コピー', exact: true })).toBeVisible();
});
