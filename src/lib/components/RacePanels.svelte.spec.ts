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

it('タブの並びを常に描き、パネルをタブの名前で結ぶ（出てくる瞬間に一覧がずれない）', async () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	const screen = render(RacePanels, {
		target: form,
		props: {
			label: '予想',
			children: createRawSnippet(() => ({ render: () => '<p>入力</p>' })),
			information: createRawSnippet(() => ({ render: () => '<p>コース資料</p>' }))
		}
	});
	await expect.element(screen.getByRole('tablist', { name: 'レースの表示' })).toBeVisible();
	expect(form.querySelectorAll('[role="tab"]')).toHaveLength(2);
	expect(form.querySelector('#race-panel-0')?.getAttribute('aria-labelledby')).toBe('race-tab-0');
	expect(form.querySelector('#race-panel-1')?.getAttribute('aria-labelledby')).toBe('race-tab-1');
});

it('選んだタブは文字を primary・太字にして下に線を引き、選んでいないタブは線を透明にする', async () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	const screen = render(RacePanels, {
		target: form,
		props: {
			label: '予想',
			children: createRawSnippet(() => ({ render: () => '<p>入力</p>' })),
			information: createRawSnippet(() => ({ render: () => '<p>コース資料</p>' }))
		}
	});
	const selected = screen.getByRole('tab', { name: '予想', exact: true });
	const other = screen.getByRole('tab', { name: 'レース情報' });
	await expect.element(selected).toHaveAttribute('aria-selected', 'true');
	await expect.element(other).toHaveAttribute('aria-selected', 'false');
	await expect.element(selected).toHaveClass(/border-primary/);
	await expect.element(selected).toHaveClass(/text-primary/);
	await expect.element(other).toHaveClass(/border-transparent/);

	await other.click();
	await expect.element(other).toHaveAttribute('aria-selected', 'true');
	await expect.element(other).toHaveClass(/border-primary/);
	await expect.element(selected).toHaveClass(/border-transparent/);
});
