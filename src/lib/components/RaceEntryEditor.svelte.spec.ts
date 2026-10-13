import '../../routes/layout.css';
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

const memoSnippet = createRawSnippet(() => ({
	render: () => '<p data-testid="memo">閉じた行のメモ</p>'
}));

it('memo は details の前に出て、行を開いている間は隠れ、閉じると戻る', async () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: '',
			memo: memoSnippet,
			children: createRawSnippet(() => ({ render: () => '<p>中身</p>' }))
		}
	});
	const memo = form.querySelector<HTMLElement>('[data-testid="memo"]')!;
	const details = form.querySelector('details')!;
	// details の前にある
	expect(memo.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(getComputedStyle(memo.parentElement!).display).not.toBe('none');

	details.querySelector('summary')!.focus();
	await userEvent.keyboard('{Enter}');
	expect(details.open).toBe(true);
	expect(getComputedStyle(memo.parentElement!).display).toBe('none');

	await userEvent.keyboard('{Enter}');
	expect(details.open).toBe(false);
	expect(getComputedStyle(memo.parentElement!).display).not.toBe('none');
});

it('中の「詳細情報」の details を開いても、memo は隠れない', () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: '',
			memo: memoSnippet,
			children: createRawSnippet(() => ({
				render: () => '<details open><summary>詳細情報</summary>中</details>'
			}))
		}
	});
	const memo = form.querySelector<HTMLElement>('[data-testid="memo"]')!;
	expect(getComputedStyle(memo.parentElement!).display).not.toBe('none');
});

it('memo が無ければ memo の枠を出さない', () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: 'メモを入力する',
			children: createRawSnippet(() => ({ render: () => '<p>中身</p>' }))
		}
	});
	expect(form.querySelector('details')!.previousElementSibling).toBeNull();
});

it('status が空なら左の文言を出さず、開く文言は右に寄せたまま', () => {
	const form = document.createElement('form');
	document.body.appendChild(form);
	render(RaceEntryEditor, {
		target: form,
		props: {
			horseName: '見本馬',
			status: '',
			openLabel: '書き直す',
			children: createRawSnippet(() => ({ render: () => '<p>中身</p>' }))
		}
	});
	const summary = form.querySelector('summary')!;
	// 馬名（sr-only）と右の操作の2つだけ。状態の文言の span は無い。
	expect(summary.children).toHaveLength(2);
	expect(summary.textContent).toContain('見本馬');
	expect(summary.textContent).toContain('書き直す');
	const right = summary.lastElementChild as HTMLElement;
	expect(right.getBoundingClientRect().right).toBeCloseTo(
		summary.getBoundingClientRect().right - parseFloat(getComputedStyle(summary).paddingRight),
		0
	);
});
