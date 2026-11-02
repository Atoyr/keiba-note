import '../../routes/layout.css';
import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EntryInsightList from './EntryInsightList.svelte';
import { InsightSaver } from '$lib/utils/insight-saver.svelte';

afterEach(() => {
	document.querySelectorAll('form#entry-insights').forEach((f) => f.remove());
});

const rows = [
	{ entryId: 'e1', horseName: '一番馬', bracket: 1, horseNumber: 1, finishPosition: 1 },
	{ entryId: 'e2', horseName: '二番馬', bracket: 2, horseNumber: 2, finishPosition: 2 }
];

function setup(registered = ['前が壁']) {
	const saver = new InsightSaver({
		storageKey: 'spec:insight-list',
		initial: {},
		entryIds: ['e1', 'e2'],
		send: () => new Promise(() => {})
	});
	const form = document.createElement('form');
	form.id = 'entry-insights';
	form.addEventListener('submit', (e) => e.preventDefault());
	document.body.appendChild(form);
	return render(EntryInsightList, { rows, saver, registered, formId: 'entry-insights' });
}

it('馬を1頭1行で並べ、別の馬を開くと前の馬が閉じる', async () => {
	const screen = setup();
	const one = screen.getByRole('button', { name: /一番馬\s*の気づき/ });
	const two = screen.getByRole('button', { name: /二番馬\s*の気づき/ });
	await expect.element(one).toHaveAttribute('aria-expanded', 'false');

	await one.click();
	await expect.element(one).toHaveAttribute('aria-expanded', 'true');

	await two.click();
	await expect.element(two).toHaveAttribute('aria-expanded', 'true');
	await expect.element(one).toHaveAttribute('aria-expanded', 'false');

	// 同じ行をもう一度押すと閉じる。
	await two.click();
	await expect.element(two).toHaveAttribute('aria-expanded', 'false');
});

it('言葉が0個なら、登録の案内とリンクを1回だけ出す（自由入力は行を開けば使える）', async () => {
	const screen = setup([]);
	await expect
		.element(screen.getByText('よく使う言葉を登録すると、押すだけで残せます。'))
		.toBeVisible();
	expect(screen.getByRole('link', { name: '言葉を登録する' }).elements()).toHaveLength(1);
	expect(screen.getByRole('link').elements()).toHaveLength(1);
	await screen.getByRole('button', { name: /一番馬\s*の気づき/ }).click();
	await expect.element(screen.getByRole('textbox', { name: '一番馬の気づき' })).toBeVisible();
	expect(screen.getByRole('link').elements()).toHaveLength(1);
});

it('言葉があれば、説明と「言葉を登録・編集する」のリンクを1回だけ出す', async () => {
	const screen = setup();
	await expect
		.element(screen.getByText('馬を押して、言葉を選ぶだけ。押すと保存されます。'))
		.toBeVisible();
	expect(screen.getByRole('link', { name: '言葉を登録・編集する' }).elements()).toHaveLength(1);
	await screen.getByRole('button', { name: /一番馬\s*の気づき/ }).click();
	expect(screen.getByRole('link').elements()).toHaveLength(1);
});

it('着順の列は一覧のだれかに着順があれば全行が取り、だれにも無ければ取らない', async () => {
	const saver = new InsightSaver({
		storageKey: 'spec:insight-list-rank',
		initial: {},
		entryIds: ['e1', 'e2'],
		send: () => new Promise(() => {})
	});
	const form = document.createElement('form');
	form.id = 'entry-insights';
	document.body.appendChild(form);
	const mixed = render(EntryInsightList, {
		rows: [rows[0], { ...rows[1], finishPosition: null }],
		saver,
		registered: ['前が壁'],
		formId: 'entry-insights'
	});
	const widths = () => mixed.container.querySelectorAll('button[aria-expanded] > span.w-8').length;
	expect(widths()).toBe(2);
	mixed.unmount();

	const none = render(EntryInsightList, {
		rows: rows.map((r) => ({ ...r, finishPosition: null })),
		saver,
		registered: ['前が壁'],
		formId: 'entry-insights'
	});
	expect(none.container.querySelectorAll('button[aria-expanded] > span.w-8').length).toBe(0);
});

it('札の列は一覧のだれかに枠か馬番があれば全行が取り、だれにも無ければ出さない', async () => {
	const saver = new InsightSaver({
		storageKey: 'spec:insight-list-badge',
		initial: {},
		entryIds: ['e1', 'e2'],
		send: () => new Promise(() => {})
	});
	const form = document.createElement('form');
	form.id = 'entry-insights';
	document.body.appendChild(form);
	const mixed = render(EntryInsightList, {
		rows: [rows[0], { ...rows[1], bracket: null, horseNumber: null }],
		saver,
		registered: ['前が壁'],
		formId: 'entry-insights'
	});
	expect(mixed.container.querySelectorAll('button[aria-expanded] > span.w-11').length).toBe(2);
	mixed.unmount();

	const none = render(EntryInsightList, {
		rows: rows.map((r) => ({ ...r, bracket: null, horseNumber: null })),
		saver,
		registered: ['前が壁'],
		formId: 'entry-insights'
	});
	expect(none.container.querySelectorAll('button[aria-expanded] > span.w-11').length).toBe(0);
});
