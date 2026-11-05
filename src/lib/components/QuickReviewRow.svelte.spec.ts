import '../../routes/layout.css';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import QuickReviewRow from './QuickReviewRow.test.svelte';

const base = {
	horseName: '見本馬',
	entryId: 'e1',
	registered: ['前が壁', '内詰まり'],
	bracket: 3,
	horseNumber: 5,
	finishPosition: 2
};
const rowButton = (screen: ReturnType<typeof render>) =>
	screen.getByRole('button', { name: /見本馬\s*のクイック入力/ });

it('閉じた行に着順・馬番・馬名を出し、本文があれば馬名の下に出す', async () => {
	const screen = render(QuickReviewRow, { ...base, body: '前が壁、出遅れ' });
	const toggle = rowButton(screen);
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect.element(toggle).toHaveTextContent('2着');
	await expect.element(toggle).toHaveTextContent('見本馬');
	await expect.element(toggle).toHaveTextContent('前が壁、出遅れ');
	await expect.element(toggle.getByRole('img', { name: '3枠5番' })).toBeVisible();
});

it('開いてもフォーカスは動かない。Esc で閉じて行のボタンへ戻る', async () => {
	const screen = render(QuickReviewRow, base);
	await rowButton(screen).click();
	await expect.element(rowButton(screen)).toHaveAttribute('aria-expanded', 'true');
	expect(document.activeElement).toBe(rowButton(screen).element());

	await screen.getByRole('button', { name: /見本馬の\s*前が壁/ }).click();
	await userEvent.keyboard('{Escape}');
	await expect.element(rowButton(screen)).toHaveAttribute('aria-expanded', 'false');
	await expect.poll(() => document.activeElement).toBe(rowButton(screen).element());
});

it('aria-pressed は本文から決まり、押すと足した本文・もう一度で抜いた本文を渡す', async () => {
	const onbody = vi.fn();
	const screen = render(QuickReviewRow, { ...base, body: '伸びた。', onbody });
	await rowButton(screen).click();
	const word = screen.getByRole('button', { name: /見本馬の\s*前が壁/ });
	await expect.element(word).toHaveAttribute('aria-pressed', 'false');

	await word.click();
	expect(onbody).toHaveBeenLastCalledWith('伸びた。前が壁');
	await expect.element(word).toHaveAttribute('aria-pressed', 'true');

	await word.click();
	expect(onbody).toHaveBeenLastCalledWith('伸びた。');
	await expect.element(word).toHaveAttribute('aria-pressed', 'false');
});

it('文中の同じ字は「入っている」と数えない', async () => {
	const screen = render(QuickReviewRow, { ...base, body: '前が壁になった' });
	await rowButton(screen).click();
	await expect
		.element(screen.getByRole('button', { name: /見本馬の\s*前が壁/ }))
		.toHaveAttribute('aria-pressed', 'false');
});

it('上限を超えるときは本文を変えず、状態の行に文を出す', async () => {
	const onbody = vi.fn();
	const screen = render(QuickReviewRow, { ...base, body: 'あ'.repeat(10000), onbody });
	await rowButton(screen).click();
	await screen.getByRole('button', { name: /見本馬の\s*前が壁/ }).click();
	expect(onbody).not.toHaveBeenCalled();
	await expect
		.element(screen.getByRole('status'))
		.toHaveTextContent('メモが長すぎるため、これ以上入れられません。');
});

it('言葉が0個なら行を開けない（ボタンも aria-expanded も出さず、読むだけで本文は出す）', async () => {
	const screen = render(QuickReviewRow, { ...base, registered: [], body: '前が壁' });
	expect(screen.getByRole('button').elements()).toHaveLength(0);
	expect(screen.container.querySelector('[aria-expanded]')).toBeNull();
	await expect.element(screen.getByText('見本馬')).toBeVisible();
	await expect.element(screen.getByText('前が壁')).toBeVisible();
});
