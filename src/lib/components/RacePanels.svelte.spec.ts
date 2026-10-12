import { createRawSnippet } from 'svelte';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import RacePanels from './RacePanels.svelte';

it('タブをキーで往復しても非表示の入力をDOMとFormDataに保持する', async () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	const screen = render(RacePanels, {
		target: form,
		props: {
			label: '予想',
			children: createRawSnippet(() => ({
				render: () => '<textarea name="body.e1" aria-label="予想メモ">下書き</textarea>'
			})),
			information: createRawSnippet(() => ({ render: () => '<p>コース資料</p>' }))
		}
	});
	await expect
		.element(screen.getByRole('tab', { name: '予想', exact: true }))
		.toHaveAttribute('aria-selected', 'true');
	await screen.getByRole('tab', { name: '予想', exact: true }).click();
	await userEvent.keyboard('{ArrowRight}');
	await expect.element(screen.getByRole('tab', { name: 'レース情報' })).toHaveFocus();
	expect(new FormData(form).get('body.e1')).toBe('下書き');
	await userEvent.keyboard('{Home}');
	await expect.element(screen.getByRole('textbox', { name: '予想メモ' })).toHaveValue('下書き');
});
