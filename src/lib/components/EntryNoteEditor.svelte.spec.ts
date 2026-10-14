import '../../routes/layout.css';
import { createRawSnippet } from 'svelte';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import EntryNoteEditor from './EntryNoteEditor.svelte';

const memo = createRawSnippet(() => ({ render: () => '<p>内枠が向きそう</p>' }));
const fields = createRawSnippet(() => ({
	render: () =>
		'<div><textarea name="body.e1" aria-label="見本馬のメモ">保存した本文</textarea></div>'
}));

function mount(props: { hasMemo: boolean; label?: '出走前メモ' | 'ふりかえりメモ' }) {
	const form = document.createElement('form');
	document.body.appendChild(form);
	const screen = render(EntryNoteEditor, {
		target: form,
		props: { horseName: '見本馬', label: '出走前メモ', memo, children: fields, ...props }
	});
	return { form, screen };
}

const box = (form: HTMLFormElement) => form.querySelector<HTMLElement>('.entry-note-box')!;

it('メモがあれば、メモの表示そのものがボタンで、名前に馬名と「書き直す」と見えている文字が入る', async () => {
	const { screen } = mount({ hasMemo: true });
	const button = screen.getByRole('button', {
		name: /見本馬の出走前メモを書き直す。.*内枠が向きそう/
	});
	await expect.element(button).toBeVisible();
	// 書いていない間しか描かれないので、aria-expanded / aria-controls は付けない（常に false になって何も伝えない）。
	await expect.element(button).not.toHaveAttribute('aria-expanded');
	await expect.element(button).not.toHaveAttribute('aria-controls');
	await expect
		.element(screen.getByRole('button', { name: /＋ 出走前メモ/ }))
		.not.toBeInTheDocument();
});

it('メモが無ければ「＋ 出走前メモ」。名前の先頭に馬名が入り、ふりかえりでは「＋ ふりかえりメモ」', async () => {
	const { screen } = mount({ hasMemo: false });
	await expect
		.element(screen.getByRole('button', { name: /見本馬の\s*＋ 出走前メモ/ }))
		.toBeVisible();
	screen.unmount();
	const review = mount({ hasMemo: false, label: 'ふりかえりメモ' });
	await expect
		.element(review.screen.getByRole('button', { name: /見本馬の\s*＋ ふりかえりメモ/ }))
		.toBeVisible();
});

it('書いていない間も入力欄は DOM にあり（hidden）、フォームに含まれる', () => {
	const { form } = mount({ hasMemo: true });
	expect(box(form).hidden).toBe(true);
	expect(getComputedStyle(box(form)).display).toBe('none');
	expect(new FormData(form).get('body.e1')).toBe('保存した本文');
});

it('押すと入力欄が出て本文にフォーカスが移り、メモの表示は消える', async () => {
	const { form, screen } = mount({ hasMemo: true });
	await screen.getByRole('button', { name: /書き直す/ }).click();
	expect(box(form).hidden).toBe(false);
	expect(document.activeElement).toBe(form.querySelector('textarea'));
	await expect.element(screen.getByRole('button', { name: /書き直す/ })).not.toBeInTheDocument();
	// 入力欄と同じものが2つ並ばない。
	expect(form.textContent).not.toContain('内枠が向きそう');
});

it('「閉じる」で閉じてフォーカスが押したボタンへ戻る。「完了」のボタンは無い', async () => {
	const { form, screen } = mount({ hasMemo: false });
	await screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	expect(box(form).hidden).toBe(false);
	await expect.element(screen.getByRole('button', { name: /完了/ })).not.toBeInTheDocument();
	await screen.getByRole('button', { name: /見本馬の出走前メモを\s*閉じる/ }).click();
	expect(box(form).hidden).toBe(true);
	const opener = screen.getByRole('button', { name: /＋ 出走前メモ/ });
	await expect.element(opener).toBeVisible();
	await expect.element(opener).toHaveFocus();
});

it('閉じても入力は捨てない（打った値がフォームに残る）', async () => {
	const { form, screen } = mount({ hasMemo: false });
	await screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	form.querySelector('textarea')!.value = '閉じる前に打った本文';
	await screen.getByRole('button', { name: /見本馬の出走前メモを\s*閉じる/ }).click();
	expect(box(form).hidden).toBe(true);
	expect(new FormData(form).get('body.e1')).toBe('閉じる前に打った本文');
});

it('Esc でも「閉じる」と同じに閉じて、フォーカスがボタンへ戻る', async () => {
	const { form, screen } = mount({ hasMemo: true });
	await screen.getByRole('button', { name: /書き直す/ }).click();
	expect(document.activeElement).toBe(form.querySelector('textarea'));
	await userEvent.keyboard('{Escape}');
	expect(box(form).hidden).toBe(true);
	await expect.element(screen.getByRole('button', { name: /書き直す/ })).toHaveFocus();
});

it('キーボードの Enter で開ける', async () => {
	const { form, screen } = mount({ hasMemo: false });
	const opener = screen.getByRole('button', { name: /＋ 出走前メモ/ });
	(opener.element() as HTMLElement).focus();
	await userEvent.keyboard('{Enter}');
	expect(box(form).hidden).toBe(false);
});

it('変換中の Esc では閉じない', async () => {
	const { form, screen } = mount({ hasMemo: false });
	await screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	const textarea = form.querySelector('textarea')!;
	textarea.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
	);
	textarea.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true })
	);
	expect(box(form).hidden).toBe(false);
	// 変換が終われば閉じる。
	textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await expect.element(screen.getByRole('button', { name: /＋ 出走前メモ/ })).toHaveFocus();
	expect(box(form).hidden).toBe(true);
});

it('メモのボタンは「＋」のボタンと同じ高さ以上（min-h-11）', async () => {
	const withMemo = mount({ hasMemo: true });
	const memoButton = withMemo.screen.getByRole('button', { name: /書き直す/ }).element();
	expect(memoButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
	withMemo.screen.unmount();
	const plain = mount({ hasMemo: false });
	const plus = plain.screen.getByRole('button', { name: /＋ 出走前メモ/ }).element();
	expect(plus.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it('メモのボタンには鉛筆のアイコンが付く（hover の無い端末でも押せると分かる）。読み上げには出さない', async () => {
	const { screen } = mount({ hasMemo: true });
	const button = screen.getByRole('button', { name: /書き直す/ }).element();
	const icon = button.querySelector('svg');
	expect(icon).not.toBeNull();
	expect(icon!.getAttribute('aria-hidden')).toBe('true');
});
