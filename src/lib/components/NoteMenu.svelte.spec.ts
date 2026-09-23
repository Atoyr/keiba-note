import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import NoteMenu from './NoteMenu.svelte';

const children = createRawSnippet(() => ({
	render: () => '<button type="button">共有リンクを作る</button>'
}));

describe('NoteMenu', () => {
	// 共有は脇役。一覧に出しっぱなしにすると画面で一番目立つ要素になっていた。
	it('開くまで中の操作は見えない', async () => {
		const screen = render(NoteMenu, { children });

		await expect.element(screen.getByTitle('メモの操作')).toBeVisible();
		await expect.element(screen.getByText('共有リンクを作る')).not.toBeVisible();
	});

	it('押すと中の操作が出る', async () => {
		const screen = render(NoteMenu, { children });

		await screen.getByTitle('メモの操作').click();

		await expect.element(screen.getByText('共有リンクを作る')).toBeVisible();
	});

	// `<details>` は自分では閉じない。以前は中の操作を押すまで開いたまま残っていた。
	it('外側を押すと閉じる', async () => {
		const screen = render(NoteMenu, { children });
		await screen.getByTitle('メモの操作').click();
		await expect.element(screen.getByText('共有リンクを作る')).toBeVisible();

		document.body.click();

		await expect.element(screen.getByText('共有リンクを作る')).not.toBeVisible();
	});

	it('メニューの中を押しても閉じない', async () => {
		const screen = render(NoteMenu, { children });
		await screen.getByTitle('メモの操作').click();

		await screen.getByText('共有リンクを作る').click();

		await expect.element(screen.getByText('共有リンクを作る')).toBeVisible();
	});

	it('Esc で閉じて、フォーカスは `⋯` に戻る', async () => {
		const screen = render(NoteMenu, { children });
		await screen.getByTitle('メモの操作').click();
		await screen.getByText('共有リンクを作る').click();

		await userEvent.keyboard('{Escape}');

		await expect.element(screen.getByText('共有リンクを作る')).not.toBeVisible();
		await expect.element(screen.getByTitle('メモの操作')).toHaveFocus();
	});

	it('何の操作かを読み上げられる名前が付く', async () => {
		const screen = render(NoteMenu, { children, label: '近況メモの操作' });

		await expect
			.element(screen.getByTitle('近況メモの操作'))
			.toHaveAttribute('aria-label', '近況メモの操作');
	});
});
