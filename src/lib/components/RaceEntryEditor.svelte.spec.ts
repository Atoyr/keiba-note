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
