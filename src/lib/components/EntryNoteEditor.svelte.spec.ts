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
	const { form, screen } = mount({ hasMemo: true });
	const button = screen.getByRole('button', {
		name: /見本馬の出走前メモを書き直す。.*内枠が向きそう/
	});
	await expect.element(button).toBeVisible();
	// 開け閉めのボタンなので、開いているかを aria-expanded で伝え、入力欄の箱を aria-controls で指す。
	await expect.element(button).toHaveAttribute('aria-expanded', 'false');
	await expect.element(button).toHaveAttribute('aria-controls', box(form).id);
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

it('押すと入力欄が出て本文にフォーカスが移り、メモの表示は消えて、ボタンは見出しになる', async () => {
	const { form, screen } = mount({ hasMemo: true });
	await screen.getByRole('button', { name: /書き直す/ }).click();
	expect(box(form).hidden).toBe(false);
	expect(document.activeElement).toBe(form.querySelector('textarea'));
	await expect.element(screen.getByRole('button', { name: /書き直す/ })).not.toBeInTheDocument();
	// 入力欄と同じものが2つ並ばない。
	expect(form.textContent).not.toContain('内枠が向きそう');
	const heading = screen.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true });
	await expect.element(heading).toBeVisible();
	await expect.element(heading).toHaveAttribute('aria-controls', box(form).id);
});

it('見出しを押すと折りたたまれ、フォーカスは同じボタンに残る。名前は元に戻る（メモなし）', async () => {
	const { form, screen } = mount({ hasMemo: false });
	await screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	expect(box(form).hidden).toBe(false);
	await screen.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true }).click();
	expect(box(form).hidden).toBe(true);
	const toggle = screen.getByRole('button', { name: /＋ 出走前メモ/ });
	await expect.element(toggle).toBeVisible();
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect.element(toggle).toHaveFocus();
});

it('見出しを押して折りたたむと、メモの表示（書き直す）に戻る', async () => {
	const { form, screen } = mount({ hasMemo: true });
	await screen.getByRole('button', { name: /書き直す/ }).click();
	await screen.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true }).click();
	expect(box(form).hidden).toBe(true);
	const toggle = screen.getByRole('button', { name: /見本馬の出走前メモを書き直す。/ });
	await expect.element(toggle).toBeVisible();
	await expect.element(toggle).toHaveFocus();
});

it('折りたたんでも入力は捨てない（打った値がフォームに残る）。「閉じる」「完了」のボタンは無い', async () => {
	const { form, screen } = mount({ hasMemo: false });
	await screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	await expect.element(screen.getByRole('button', { name: /閉じる|完了/ })).not.toBeInTheDocument();
	form.querySelector('textarea')!.value = '折りたたむ前に打った本文';
	await screen.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true }).click();
	expect(box(form).hidden).toBe(true);
	expect(new FormData(form).get('body.e1')).toBe('折りたたむ前に打った本文');
});

it('Esc でも折りたたんで、フォーカスがボタンへ戻る', async () => {
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

it('変換中の Esc では折りたたまない', async () => {
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

it('3つの状態（メモあり・メモなし・書いている）とも、ボタンは高さ 44px 以上（min-h-11）', async () => {
	const withMemo = mount({ hasMemo: true });
	const memoButton = withMemo.screen.getByRole('button', { name: /書き直す/ }).element();
	expect(memoButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
	withMemo.screen.unmount();
	const plain = mount({ hasMemo: false });
	const plus = plain.screen.getByRole('button', { name: /＋ 出走前メモ/ }).element();
	expect(plus.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
	await plain.screen.getByRole('button', { name: /＋ 出走前メモ/ }).click();
	const heading = plain.screen
		.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true })
		.element();
	expect(heading.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it('ボタンの右端に山形が付く（折りたたみ中は下向き、開くと上向き）。読み上げには出さない', async () => {
	for (const hasMemo of [true, false]) {
		const { screen } = mount({ hasMemo });
		const closed = screen.getByRole('button', { name: /書き直す|＋ 出走前メモ/ }).element();
		const down = closed.querySelector('svg');
		expect(down).not.toBeNull();
		expect(down!.getAttribute('aria-hidden')).toBe('true');
		expect(down!.classList.contains('lucide-chevron-down')).toBe(true);
		(closed as HTMLElement).click();
		await expect
			.element(screen.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true }))
			.toBeVisible();
		const open = screen
			.getByRole('button', { name: /見本馬の\s*出走前メモ/, expanded: true })
			.element();
		const up = open.querySelector('svg');
		expect(up!.getAttribute('aria-hidden')).toBe('true');
		expect(up!.classList.contains('lucide-chevron-up')).toBe(true);
		screen.unmount();
	}
});
