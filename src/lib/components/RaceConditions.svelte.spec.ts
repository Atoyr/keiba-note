import type { ComponentProps } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceConditions from './RaceConditions.svelte';
import '../../routes/layout.css';

type Profile = ComponentProps<typeof RaceConditions>['profile'];

const today = '2026-10-29';
const base: Profile = {
	conditions: '3歳以上オープン 定量',
	priority: [
		{ race: 'オールカマー', places: 1 },
		{ race: '毎日王冠', places: 1 }
	],
	priorityNote: null,
	since: 2026,
	steps: []
};
const run = {
	id: 'r1',
	date: '2026-09-27',
	course: '中山',
	raceNumber: 11,
	name: 'オールカマー',
	grade: 'G2',
	winnerName: 'イチバンボシ',
	resultCount: 16
};

describe('RaceConditions', () => {
	it('条件が出る', async () => {
		const screen = render(RaceConditions, { profile: base, today });
		await expect
			.element(screen.getByRole('region', { name: 'レースの条件と前哨戦' }))
			.toHaveTextContent('3歳以上オープン 定量');
	});

	it('優先出走権: 全部1着なら「A・Bの1着馬」', async () => {
		const screen = render(RaceConditions, { profile: base, today });
		const dd = screen.container.querySelectorAll('dd')[1];
		expect(dd.textContent!.trim()).toBe('オールカマー・毎日王冠の1着馬');
		// 「の1着馬」は途中で折り返さない。
		expect(dd.querySelector('span')!.textContent).toBe('の1着馬');
		expect(getComputedStyle(dd.querySelector('span')!).whiteSpace).toBe('nowrap');
	});

	it('優先出走権: 着順が混ざるなら着順を添える', async () => {
		const screen = render(RaceConditions, {
			profile: {
				...base,
				priority: [
					{ race: 'A', places: 1 },
					{ race: 'B', places: 2 }
				]
			},
			today
		});
		const dd = screen.container.querySelectorAll('dd')[1];
		expect(dd.textContent!.trim()).toBe('A（1着）・B（2着まで）');
		expect([...dd.querySelectorAll('span')].map((x) => x.textContent)).toEqual([
			'（1着）',
			'（2着まで）'
		]);
	});

	it('優先出走権: 着順で決まらないときは note、どちらも無ければ「なし」', async () => {
		const withNote = render(RaceConditions, {
			profile: { ...base, priority: [], priorityNote: 'ファン投票の上位10頭' },
			today
		});
		await expect.element(withNote.getByText('ファン投票の上位10頭')).toBeVisible();
		withNote.unmount();
		const none = render(RaceConditions, { profile: { ...base, priority: [] }, today });
		await expect.element(none.getByText('なし', { exact: true })).toBeVisible();
	});

	it('ステップ: 結果のあるレースはふりかえりへ。勝ち馬と優先出走権の札が出る', async () => {
		const screen = render(RaceConditions, {
			profile: { ...base, steps: [{ key: 'オールカマー', priority: 1, race: run }] },
			today
		});
		const link = screen.getByRole('link', { name: 'オールカマー' });
		await expect.element(link).toHaveAttribute('href', '/races/r1');
		const li = screen.container.querySelector('li')!;
		expect(li.textContent).toContain('2026-09-27');
		expect(li.textContent).toContain('中山11R');
		// 1段目の先頭はステップの鍵。
		expect(li.querySelector('div')!.firstElementChild!.textContent).toBe('オールカマー');
		expect(li.textContent).toContain('G2');
		expect(li.textContent).toContain('勝ち馬 イチバンボシ');
		expect(li.textContent).toContain('優先出走権 1着');
	});

	it('ステップ: 2着までの札、札の無いステップ', async () => {
		const screen = render(RaceConditions, {
			profile: {
				...base,
				steps: [
					{ key: 'オールカマー', priority: 2, race: run },
					{ key: '大阪杯', priority: null, race: { ...run, id: 'r2', name: '大阪杯' } }
				]
			},
			today
		});
		const items = [...screen.container.querySelectorAll('li')];
		expect(items[0].textContent).toContain('優先出走権 2着まで');
		expect(items[1].textContent).not.toContain('優先出走権');
	});

	it('ステップ: 開催前は予想画面へ「開催前」、結果が無ければ「結果待ち」', async () => {
		const screen = render(RaceConditions, {
			profile: {
				...base,
				steps: [
					{
						key: 'a',
						priority: null,
						race: {
							...run,
							id: 'up',
							name: '先のレース',
							date: '2026-11-01',
							winnerName: null,
							resultCount: 0
						}
					},
					{
						key: 'b',
						priority: null,
						race: { ...run, id: 'wait', name: '結果待ちのレース', winnerName: null, resultCount: 0 }
					}
				]
			},
			today
		});
		await expect
			.element(screen.getByRole('link', { name: 'a' }))
			.toHaveAttribute('href', '/races/up/preview');
		await expect
			.element(screen.getByRole('link', { name: 'b' }))
			.toHaveAttribute('href', '/races/wait/preview');
		const items = [...screen.container.querySelectorAll('li')];
		expect(items[0].textContent).toContain('開催前');
		expect(items[1].textContent).toContain('結果待ち');
	});

	it('ステップ: 未登録は鍵の名前と「未登録」で、リンクにしない', async () => {
		const screen = render(RaceConditions, {
			profile: { ...base, steps: [{ key: '札幌記念', priority: null, race: null }] },
			today
		});
		const li = screen.container.querySelector('li')!;
		expect(li.textContent).toContain('札幌記念');
		expect(li.textContent).toContain('未登録');
		expect(li.querySelector('a')).toBeNull();
	});
});
