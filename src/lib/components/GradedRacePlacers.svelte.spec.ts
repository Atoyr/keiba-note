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
		await expect.element(section).toHaveTextContent('1開催は、場か距離が2025年と違います。');
		await expect
			.element(section)
			.toHaveTextContent(
				'前走は、当時の直前の出走を確かめられるデータがまだ無いため、出していません。'
			);
		await expect.element(screen.getByRole('heading', { name: '年ごとの1〜3着' })).toBeVisible();
		await expect.element(section.getByText('2023年', { exact: true })).toBeVisible();
		await expect.element(section.getByText('このレースは未登録')).toBeVisible();
		await expect
			.element(section.getByRole('link', { name: '馬1' }).first())
			.toHaveAttribute('href', '/horses/h1');
		await expect
			.element(section.getByRole('link', { name: '騎手1' }).first())
			.toHaveAttribute('href', `/jockeys/${encodeURIComponent('騎手1')}`);
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
		await expect.element(screen.getByText('条件が違う')).toBeVisible();
		await expect.element(screen.getByText('一部だけ', { exact: true })).toBeVisible();
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
		await expect.element(screen.getByText('結果が未登録')).toBeVisible();
	});
});
