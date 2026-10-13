import { createRawSnippet } from 'svelte';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import RaceEntryEditor from './RaceEntryEditor.svelte';

it('キーボードで行を開閉し、閉じた本文もフォームに含める', async () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: 'メモあり',
			children: createRawSnippet(() => ({
				render: () => '<textarea name="body.e1">保存した本文</textarea>'
			}))
		}
	});
	const details = form.querySelector('details')!;
	expect(details.open).toBe(false);
	details.querySelector('summary')!.focus();
	await userEvent.keyboard('{Enter}');
	expect(details.open).toBe(true);
	await userEvent.keyboard('{Enter}');
	expect(details.open).toBe(false);
	expect(new FormData(form).get('body.e1')).toBe('保存した本文');
});

it('行を開くボタンの名前は、馬名と見えている状態・操作の文字から作る', () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: '予想メモあり',
			openLabel: '書き直す',
			children: createRawSnippet(() => ({ render: () => '<p>中身</p>' }))
		}
	});
	const summary = form.querySelector('summary')!;
	// aria-label で上書きしない。見える文字（状態・操作）がそのまま名前に入る。
	expect(summary.hasAttribute('aria-label')).toBe(false);
	expect(summary.firstElementChild?.textContent).toBe('見本馬');
	expect(summary.textContent).toContain('予想メモあり');
	expect(summary.textContent).toContain('書き直す');
});
