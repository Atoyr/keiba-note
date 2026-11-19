import type { ComponentProps } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradedRacePlacers from './GradedRacePlacers.svelte';
import '../../routes/layout.css';

type Placers = ComponentProps<typeof GradedRacePlacers>['placers'];

const placer = (n: number, over: Partial<Placers['years'][0]['races'][0]['placers'][0]> = {}) => ({
	entryId: `e${n}`,
	finishPosition: n,
	popularity: n,
	jockey: `騎手${n}`,
	horseId: `h${n}`,
	horseName: `馬${n}`,
	sire: `父${n}`,
	damSire: `母父${n}`,
	...over
});

const raceOf = (id: string, date: string, over = {}) => ({
	id,
	date,
	course: '中山',
	raceNumber: 11,
	name: 'オールカマー',
	surface: '芝',
	distance: 2200,
	trackCondition: '良',
	...over
});

const aspects: Placers['aspects'] = [
	{
		key: 'popularity',
		known: 3,
		unknown: 0,
		rows: [
			{ value: '1番人気', wins: 1, placed: 1, sources: [{ year: '2025', finishPosition: 1 }] },
			{ value: '2番人気', wins: 0, placed: 0, sources: [] }
		]
	},
	{
		key: 'jockey',
		known: 3,
		unknown: 0,
		rows: [
			{
				value: 'ルメール',
				wins: 1,
				placed: 2,
				sources: [
					{ year: '2025', finishPosition: 1 },
					{ year: '2023', finishPosition: 2 }
				]
			},
			{ value: '武豊', wins: 0, placed: 1, sources: [{ year: '2024', finishPosition: 3 }] }
		]
	},
	{
		key: 'sire',
		known: 1,
		unknown: 2,
		rows: [{ value: '父1', wins: 1, placed: 1, sources: [{ year: '2025', finishPosition: 1 }] }]
	},
	{ key: 'damSire', known: 0, unknown: 3, rows: [] }
];

const normal: Placers = {
	fromYear: 2016,
	toYear: 2025,
	years: [
		{
			year: '2025',
			races: [
				{
					race: raceOf('r25', '2025-09-28'),
					differs: false,
					complete: true,
					placers: [placer(1), placer(2, { popularity: null, jockey: null, sire: null }), placer(3)]
				}
			]
		},
		{
			year: '2024',
			races: [
				{
					race: raceOf('r24', '2024-09-22', { course: '新潟' }),
					differs: true,
					complete: false,
					placers: [placer(1)]
				}
			]
		},
		{ year: '2023', races: [] }
	],
	counts: {
		complete: 1,
		partial: 1,
		noResult: 0,
		missingYears: ['2023'],
		differs: 1,
		placers: 4,
		winners: 2
	},
	baseYear: '2025',
	aspects
};

describe('GradedRacePlacers', () => {
	it('見出しと窓、充足の行、前走の行、年ごとの一覧が出る', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const section = screen.getByRole('region', { name: /過去の好走馬/ });
		await expect.element(section).toHaveTextContent('2016〜2025年の1〜3着');
		await expect
			.element(section)
			.toHaveTextContent('結果がそろっている開催 1・一部だけ 1・レースが未登録 1年（2023年）');
		await expect
			.element(section)
			.toHaveTextContent('1開催は、場・芝ダート・距離のどれかが2025年と違います。');
		await expect
			.element(section)
			.toHaveTextContent(
				'前走は未整備です。当時の直前の出走を確かめられるデータがまだ無いため、出していません。'
			);
		await expect.element(screen.getByRole('heading', { name: '年ごとの1〜3着' })).toBeVisible();
		await expect.element(section.getByText('このレースは未登録').first()).toBeVisible();
		await expect
			.element(section.getByRole('link', { name: '馬1' }).first())
			.toHaveAttribute('href', '/horses/h1');
		// 騎手は閉じた「年ごとの詳細」の中。
		const jockey = screen.container.querySelector('ol a[href^="/jockeys/"]')!;
		expect(jockey.getAttribute('href')).toBe(`/jockeys/${encodeURIComponent('騎手1')}`);
	});

	it('値が null の人気・騎手・父は「不明」と文字で出す', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const row = screen.container.querySelectorAll('ol li ul li')[1];
		expect(row.textContent).toContain('人気 不明');
		expect(row.textContent).toContain('騎手 不明');
		expect(row.textContent).toContain('父 不明');
		expect(row.textContent).toContain('母父 母父2');
	});

	it('条件が違う開催に札を出し、一部だけの開催にも出す', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const table = screen.container.querySelector('table[data-placers-table]')!;
		expect(table.textContent).toContain('条件が違う');
		// 一部だけの札は縦の一覧（閉じた details）の中にある。
		expect(screen.container.querySelector('ol')!.textContent).toContain('一部だけ');
	});

	it('人気だけ開けてあり、不明があれば観点の見出しに件数が出る', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const details = [...screen.container.querySelectorAll('details')];
		const popularity = details.find((d) =>
			d.querySelector('summary')?.textContent?.includes('人気')
		)!;
		expect(popularity.open).toBe(true);
		const labels = details.map((d) => d.querySelector('summary')!.textContent!.trim());
		expect(labels).toContain('人気');
		expect(labels).toContain('騎手');
		expect(labels).toContain('父（分かる 1・不明 2）');
		expect(labels).toContain('母父（分かる 0・不明 3）');
		expect(details.filter((d) => d.open)).toEqual([popularity]);
	});

	it('表は caption と scope を持ち、騎手は2回以上の行だけ表に出して1回だけを畳む', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const caption = [...screen.container.querySelectorAll('caption')].map((c) => c.textContent);
		expect(caption).toContain('騎手ごとの勝ち馬と3着以内の数');
		const jockeyTable = [...screen.container.querySelectorAll('table')].find((t) =>
			t.querySelector('caption')?.textContent?.startsWith('騎手')
		)!;
		const rowHeads = [...jockeyTable.querySelectorAll('tbody th[scope="row"]')].map(
			(th) => th.textContent
		);
		expect(rowHeads).toHaveLength(1);
		expect(rowHeads[0]).toContain('ルメール');
		expect(rowHeads[0]).toContain('2025年1着・2023年2着');
		expect(jockeyTable.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
		const once = [...screen.container.querySelectorAll('details details')].find((d) =>
			d.textContent?.includes('1回だけ（1）')
		)!;
		expect(once.textContent).toContain('武豊（2024年3着）');
		expect(once.hasAttribute('open')).toBe(false);
	});

	it('分かる出走が0件の観点は、表を出さず案内を出す', async () => {
		const screen = render(GradedRacePlacers, { placers: normal });
		const damSire = [...screen.container.querySelectorAll('details')].find((d) =>
			d.querySelector('summary')?.textContent?.includes('母父')
		)!;
		expect(damSire.querySelector('table')).toBeNull();
		expect(damSire.textContent).toContain('分かっている出走がありません。');
	});

	it('結果が0件のときは、見出しと案内だけを出す', async () => {
		const screen = render(GradedRacePlacers, {
			placers: {
				...normal,
				years: [],
				counts: { ...normal.counts, complete: 0, partial: 0, differs: 0, placers: 0, winners: 0 }
			}
		});
		const section = screen.getByRole('region', { name: /過去の好走馬/ });
		await expect
			.element(section)
			.toHaveTextContent('2016〜2025年のこのレースの結果は、まだ登録されていません。');
		expect(screen.container.querySelector('details')).toBeNull();
		expect(screen.container.querySelector('table')).toBeNull();
		expect(screen.container.textContent).not.toContain('前走は');
		expect(screen.container.textContent).not.toContain('年ごとの1〜3着');
	});

	it('結果が未登録の開催には、その旨の文字を出す', async () => {
		const screen = render(GradedRacePlacers, {
			placers: {
				...normal,
				years: [
					...normal.years.slice(0, 1),
					{
						year: '2022',
						races: [
							{ race: raceOf('r22', '2022-09-25'), differs: false, complete: false, placers: [] }
						]
					}
				]
			}
		});
		const cell = screen.container.querySelector('table[data-placers-table] td[colspan="3"]')!;
		expect(cell.textContent).toBe('結果が未登録');
	});
});

describe('GradedRacePlacers の年×着順の表', () => {
	const yearsTable = (c: HTMLElement) =>
		c.querySelector<HTMLTableElement>('table[data-placers-table]')!;

	it('caption と見出しのセルを持ち、行は年の数だけある', () => {
		const { container } = render(GradedRacePlacers, { placers: normal });
		const t = yearsTable(container);
		expect(t.querySelector('caption')!.textContent).toBe('年ごとの1〜3着の馬と人気');
		expect(
			[...t.querySelectorAll('thead th[scope="col"]')].map((x) => x.textContent!.trim())
		).toEqual(['年', '1着', '2着', '3着']);
		const rows = t.querySelectorAll('tbody tr');
		expect(rows).toHaveLength(3);
		for (const r of rows) expect(r.querySelector('th[scope="row"]')).not.toBeNull();
	});

	it('未登録の年は colspan のセルで「このレースは未登録」', () => {
		const { container } = render(GradedRacePlacers, { placers: normal });
		const cell = yearsTable(container).querySelectorAll('tbody tr')[2].querySelector('td')!;
		expect(cell.getAttribute('colspan')).toBe('3');
		expect(cell.textContent).toBe('このレースは未登録');
	});

	it('年の数字はレースへのリンクで、条件が違う開催に文字が出る', () => {
		const { container } = render(GradedRacePlacers, { placers: normal });
		const rows = yearsTable(container).querySelectorAll('tbody tr');
		const link = rows[0].querySelector('th a')!;
		expect(link.textContent).toBe('2025');
		expect(link.getAttribute('href')).toBe('/races/r25');
		expect(rows[1].querySelector('th')!.textContent).toContain('条件が違う');
		expect(rows[0].querySelector('th')!.textContent).not.toContain('条件が違う');
	});

	it('同着は同じセルに2頭並び、一部だけの開催の欠けたセルは「—」と読み上げ用の文字', () => {
		const tie: Placers = {
			...normal,
			years: [
				{
					year: '2025',
					races: [
						{
							race: raceOf('r25', '2025-09-28'),
							differs: false,
							complete: false,
							placers: [
								placer(1),
								placer(3, { entryId: 'e3a' }),
								placer(3, { entryId: 'e3b', horseId: 'hx', horseName: '馬X' })
							]
						}
					]
				}
			]
		};
		const { container } = render(GradedRacePlacers, { placers: tie });
		const cells = yearsTable(container).querySelectorAll('tbody tr td');
		expect(cells).toHaveLength(3);
		expect(cells[2].querySelectorAll('a')).toHaveLength(2);
		expect(cells[1].textContent).toContain('—');
		expect(cells[1].querySelector('.sr-only')!.textContent).toBe('不明');
	});

	it('6番人気以下の人気の行だけ太字で、人気が null なら「人気 不明」', () => {
		const data: Placers = {
			...normal,
			years: [
				{
					year: '2025',
					races: [
						{
							race: raceOf('r25', '2025-09-28'),
							differs: false,
							complete: true,
							placers: [
								placer(1, { popularity: 5 }),
								placer(2, { popularity: 6 }),
								placer(3, { popularity: null })
							]
						}
					]
				}
			]
		};
		const { container } = render(GradedRacePlacers, { placers: data });
		const cells = [...yearsTable(container).querySelectorAll('tbody td')];
		const pop = (i: number) => cells[i].querySelector('.text-xs')!;
		expect(pop(0).classList.contains('font-bold')).toBe(false);
		expect(pop(1).classList.contains('font-bold')).toBe(true);
		expect(pop(2).textContent!.trim()).toBe('人気 不明');
		expect(pop(2).classList.contains('font-bold')).toBe(false);
		expect(container.textContent).toContain('太字は6番人気以下');
	});

	it('棒は人気の観点だけにあり、幅は3着以内 ÷ 分かる出走で、読み上げに出ない', () => {
		const data: Placers = {
			...normal,
			aspects: [
				{
					key: 'popularity',
					known: 4,
					unknown: 0,
					rows: [
						{ value: '1番人気', wins: 1, placed: 1, sources: [] },
						{ value: '2番人気', wins: 0, placed: 0, sources: [] }
					]
				},
				aspects[1]
			]
		};
		const { container } = render(GradedRacePlacers, { placers: data });
		const bars = container.querySelectorAll<HTMLElement>('[data-placed-bar]');
		expect(bars).toHaveLength(1);
		expect(bars[0].style.width).toBe('25%');
		expect(bars[0].closest('[aria-hidden="true"]')).not.toBeNull();
		const jockey = [...container.querySelectorAll('table')].find((t) =>
			t.querySelector('caption')?.textContent?.startsWith('騎手')
		)!;
		expect(jockey.querySelector('[data-placed-bar]')).toBeNull();
	});

	it('縦の一覧は閉じた details に畳んである', () => {
		const { container } = render(GradedRacePlacers, { placers: normal });
		const d = [...container.querySelectorAll('details')].find((x) =>
			x.querySelector('summary')?.textContent?.includes('年ごとの詳細（騎手・父・母父）')
		)!;
		expect(d.open).toBe(false);
		expect(d.querySelector('ol')).not.toBeNull();
	});
});
