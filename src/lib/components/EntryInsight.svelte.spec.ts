import '../../routes/layout.css';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import EntryInsight from './EntryInsight.test.svelte';
import { afterEach } from 'vitest';
import { InsightSaver, type InsightOp, type InsightValue } from '$lib/utils/insight-saver.svelte';

afterEach(() => {
	document.querySelectorAll('form#entry-insights').forEach((f) => f.remove());
});

/** 行の開け閉めのボタン（「もう一度保存する」は名前に馬名の気づきを含むので除く）。 */
const rowButton = (screen: ReturnType<typeof render>) =>
	screen.getByRole('button', { name: /見本馬\s*の気づき(?!を)/ });

/** 応答を保留する send。呼ばれた操作を calls に溜める。 */
function setup(initial: Record<string, InsightValue> = {}, registered = ['前が壁', '内詰まり']) {
	const calls: { op: InsightOp; ok: (v: InsightValue) => void; ng: () => void }[] = [];
	const saver = new InsightSaver({
		storageKey: 'spec:insight',
		initial,
		entryIds: ['e1'],
		send: (op) =>
			new Promise<InsightValue>((ok, reject) => {
				calls.push({ op, ok, ng: () => reject(new Error('net')) });
			})
	});
	// 送り先のフォーム。本物のページでは大きいフォームの外にある。
	const form = document.createElement('form');
	form.id = 'entry-insights';
	form.addEventListener('submit', (e) => e.preventDefault());
	document.body.appendChild(form);
	const screen = render(EntryInsight, {
		horseName: '見本馬',
		entryId: 'e1',
		saver,
		registered,
		formId: 'entry-insights',
		bracket: 3,
		horseNumber: 5,
		finishPosition: 2
	});
	return { screen, saver, calls, form };
}

it('閉じた行に着順・馬番・馬名を出す。開くとフォーカスは動かず、aria-expanded だけが変わる', async () => {
	const { screen } = setup();
	const toggle = rowButton(screen);
	await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect.element(toggle).toHaveTextContent('2着');
	await expect.element(toggle).toHaveTextContent('見本馬');
	await expect.element(toggle.getByRole('img', { name: '3枠5番' })).toBeVisible();

	await toggle.click();

	const opened = rowButton(screen);
	await expect.element(opened).toHaveAttribute('aria-expanded', 'true');
	// 開いてもキーボードを出さない（フォーカスはボタンのまま。メモの欄に移さない）。
	expect(document.activeElement).not.toBeInstanceOf(HTMLTextAreaElement);
	expect(document.activeElement).toBe(opened.element());
	await expect.element(screen.getByRole('button', { name: /見本馬の\s*前が壁/ })).toBeVisible();
});

it('言葉を押すとすぐ aria-pressed になり、未保存は破線。応答で実線になる', async () => {
	const { screen, calls } = setup();
	await rowButton(screen).click();

	const word = screen.getByRole('button', { name: /見本馬の\s*前が壁/ });
	await expect.element(word).toHaveAttribute('aria-pressed', 'false');
	await word.click();

	expect(calls).toHaveLength(1);
	expect(calls[0].op).toEqual({ kind: 'word', entryId: 'e1', word: '前が壁', on: true });
	await expect.element(word).toHaveAttribute('aria-pressed', 'true');
	expect(word.element().className).toContain('border-dashed');
	await expect.element(screen.getByRole('status')).toHaveTextContent('保存中…');

	calls[0].ok({ words: ['前が壁'], memo: '' });
	await vi.waitFor(() => expect(word.element().className).not.toContain('border-dashed'));
	await expect.element(screen.getByRole('status')).toHaveTextContent('保存しました');
});

it('言葉のボタンは JS が無いときの送信ボタン（toggle に付けるか外すかの JSON を持つ）', async () => {
	const { screen } = setup({ e1: { words: ['内詰まり'], memo: '' } });
	await rowButton(screen).click();

	const on = screen
		.getByRole('button', { name: /見本馬の\s*前が壁/ })
		.element() as HTMLButtonElement;
	const off = screen
		.getByRole('button', { name: /見本馬の\s*内詰まり/ })
		.element() as HTMLButtonElement;
	expect([on.type, on.name, on.getAttribute('form')]).toEqual([
		'submit',
		'toggle',
		'entry-insights'
	]);
	expect(JSON.parse(on.value)).toEqual({ entryId: 'e1', word: '前が壁', on: true });
	expect(JSON.parse(off.value)).toEqual({ entryId: 'e1', word: '内詰まり', on: false });
});

it('閉じているとき、付いた言葉とメモを馬名の下に出す（札「気づき」は出さない）', async () => {
	const { screen } = setup({ e1: { words: ['内詰まり'], memo: '2400 なら。' } });
	const toggle = rowButton(screen);
	await expect.element(toggle).toHaveTextContent('内詰まり');
	await expect.element(toggle).toHaveTextContent('2400 なら。');
});

it('言葉の登録の案内とリンクは行に出さない（タブの上に1回。EntryInsightList）', async () => {
	const { screen } = setup({}, []);
	await rowButton(screen).click();
	await expect.element(screen.getByRole('link')).not.toBeInTheDocument();
	await expect
		.element(screen.getByText('よく使う言葉を登録すると、押すだけで残せます。'))
		.not.toBeInTheDocument();
	await expect.element(screen.getByRole('textbox', { name: '見本馬の気づき' })).toBeVisible();
});

it('メモの欄は formId のフォームに属し、打つと保存の対象になる（本文の欄とは別の name）', async () => {
	const { screen, saver, calls } = setup();
	await rowButton(screen).click();

	const memo = screen.getByRole('textbox', { name: '見本馬の気づき' });
	const el = memo.element() as HTMLTextAreaElement;
	expect([el.name, el.getAttribute('form'), el.maxLength]).toEqual([
		'insightMemo.e1',
		'entry-insights',
		200
	]);
	await memo.fill('前が壁');
	expect(saver.memo('e1')).toBe('前が壁');
	// 欄を離れたら待たずに送る。
	el.blur();
	await vi.waitFor(() => expect(calls).toHaveLength(1));
	expect(calls[0].op).toEqual({ kind: 'memo', entryId: 'e1', memo: '前が壁' });
});

it('Esc で閉じて、フォーカスを開け閉めのボタンへ戻す', async () => {
	const { screen } = setup();
	const toggle = rowButton(screen);
	await toggle.click();
	await screen.getByRole('textbox', { name: '見本馬の気づき' }).click();

	await userEvent.keyboard('{Escape}');

	await expect.element(rowButton(screen)).toHaveAttribute('aria-expanded', 'false');
	await vi.waitFor(() => expect(document.activeElement).toBe(rowButton(screen).element()));
});

it('失敗したら、閉じていても alert と「もう一度保存する」を出し、押すと送り直す', async () => {
	const { screen, calls } = setup();
	await rowButton(screen).click();
	await screen.getByRole('button', { name: /見本馬の\s*前が壁/ }).click();
	// 閉じておく。
	await rowButton(screen).click();
	calls[0].ng();

	const alert = screen.getByRole('alert');
	await expect
		.element(alert)
		.toHaveTextContent('この馬の気づきを保存できませんでした。入力は端末に残っています。');
	await screen.getByRole('button', { name: /もう一度保存する/ }).click();

	expect(calls).toHaveLength(2);
	calls[1].ok({ words: ['前が壁'], memo: '' });
	await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
});

it('登録に無い言葉を押して外すときは、ボタンが消える前に開け閉めのボタンへフォーカスを移す', async () => {
	const { screen, calls } = setup({ e1: { words: ['消した言葉'], memo: '' } });
	await rowButton(screen).click();

	await screen.getByRole('button', { name: /見本馬の\s*消した言葉/ }).click();

	expect(calls[0].op).toMatchObject({ word: '消した言葉', on: false });
	expect((document.activeElement as HTMLElement).getAttribute('aria-expanded')).toBe('true');
	calls[0].ok({ words: [], memo: '' });
	await expect
		.element(screen.getByRole('button', { name: /見本馬の\s*消した言葉/ }))
		.not.toBeInTheDocument();
	expect((document.activeElement as HTMLElement).getAttribute('aria-expanded')).toBe('true');
});

it('上限で言葉が付かなかった文は、閉じた行でも出し、開いているあいだは状態の行だけに出す', async () => {
	const { screen, calls } = setup();
	await rowButton(screen).click();
	await screen.getByRole('button', { name: /見本馬\s*の?\s*前が壁/ }).click();
	calls[0].ok({ words: [], memo: '' });
	const notice = 'この馬に付けられる言葉は40個までです。';
	await expect.element(screen.getByRole('status')).toHaveTextContent(notice);
	// 開いているあいだは、状態の行の1つだけ。
	expect(screen.getByRole('status').elements()).toHaveLength(1);

	await rowButton(screen).click();
	await expect.element(screen.getByRole('status')).toHaveTextContent(notice);
	expect(screen.getByRole('status').elements()).toHaveLength(1);
});

it('札の列を取らないときは、枠・馬番の札を出さない', async () => {
	const { screen } = setup();
	expect(screen.container.querySelectorAll('[role="img"]').length).toBe(1);
	screen.rerender({ badgeColumn: false });
	await vi.waitFor(() => expect(screen.container.querySelectorAll('[role="img"]').length).toBe(0));
});
