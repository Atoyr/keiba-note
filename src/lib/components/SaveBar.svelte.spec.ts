import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SaveBar from './SaveBar.svelte';

describe('SaveBar', () => {
	it('未保存の変更が無いうちは保存ボタンを出さない', async () => {
		const screen = render(SaveBar, { dirtyCount: 0, label: '出走前メモを保存' });

		await expect
			.element(screen.getByRole('button', { name: '出走前メモを保存' }))
			.not.toBeInTheDocument();
	});

	it('未保存の変更があれば、件数と保存ボタンを出す', async () => {
		const screen = render(SaveBar, { dirtyCount: 2, label: '出走前メモを保存' });

		await expect.element(screen.getByText('未保存の変更が 2 件あります')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: '出走前メモを保存' })).toBeVisible();
	});

	it('送信中は押せないことを示し、文言を変える', async () => {
		const screen = render(SaveBar, { dirtyCount: 1, label: '出走前メモを保存', pending: true });

		const button = screen.getByRole('button', { name: '保存しています…' });
		await expect.element(button).toHaveAttribute('aria-disabled', 'true');
	});

	it('保存に失敗したときの文を、ボタンの横に alert で出す', async () => {
		const screen = render(SaveBar, {
			dirtyCount: 1,
			label: '出走前メモを保存',
			message: '本文が長すぎます'
		});

		await expect.element(screen.getByRole('alert')).toHaveTextContent('本文が長すぎます');
	});
});
