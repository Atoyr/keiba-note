import type { ComponentProps } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradedRaceTimeline from './GradedRaceTimeline.svelte';
import '../../routes/layout.css';

type Timeline = ComponentProps<typeof GradedRaceTimeline>['timeline'];

const base = {
	course: '中山',
	raceNumber: 11,
	name: 'オールカマー',
	surface: '芝',
	distance: 2200,
	trackCondition: '良',
	winnerName: null,
	resultCount: 0
};
const empty = { upcoming: false, preview: null, review: null, entryNoteCount: 0, marks: [] };

const timeline: Timeline = [
	{
		year: '2099',
		races: [
			{
				...empty,
				race: { ...base, id: 'future', date: '2099-09-27' },
				upcoming: true,
				preview: { body: '来年の見立て。', pace: null }
			}
		]
	},
	{
		year: '2025',
		races: [
			{
				...empty,
				race: {
					...base,
					id: 'last',
					date: '2025-09-28',
					name: '産経賞オールカマー',
					winnerName: 'イチバンボシ',
					resultCount: 16
				},
				preview: { body: '去年の見立て。', pace: 'スロー' },
				review: { body: '去年のふりかえり。', tags: [] },
				entryNoteCount: 2,
				marks: [
					{
						entryId: 'e1',
						mark: '◎',
						horseName: 'イチバンボシ',
						bracket: 3,
						horseNumber: 5,
						finishPosition: 1
					}
				]
			}
		]
	},
	{
		year: '2024',
		races: [{ ...empty, race: { ...base, id: 'older', date: '2024-09-22', resultCount: 16 } }]
	}
];

describe('GradedRaceTimeline', () => {
	it('年ごとに見出しを出し、年の降順（渡された順）に並べる', async () => {
		const screen = render(GradedRaceTimeline, { timeline, today: '2026-10-14' });

		const headings = [...screen.container.querySelectorAll('h3')].map((h) => h.textContent);
		expect(headings).toEqual(['2099年', '2025年', '2024年']);
	});

	it('印の行に、印・馬番・馬名・着順が出る', async () => {
		const screen = render(GradedRaceTimeline, { timeline, today: '2026-10-14' });

		const mark = screen.container.querySelector('ul > li')!;
		expect(mark.textContent).toContain('◎');
		expect(mark.textContent).toContain('イチバンボシ');
		expect(mark.textContent).toContain('1着');
		await expect.element(screen.getByRole('img', { name: '3枠5番' })).toBeInTheDocument();
		await expect.element(screen.getByText('ペース スロー')).toBeVisible();
		await expect.element(screen.getByText('勝ち馬 イチバンボシ')).toBeVisible();
		await expect.element(screen.getByText('去年のふりかえり。')).toBeVisible();
	});

	it('メモの無い行に「メモはありません」を出す。メモのある行には出さない', async () => {
		const screen = render(GradedRaceTimeline, { timeline, today: '2026-10-14' });

		await expect.element(screen.getByText('メモはありません')).toBeVisible();
		expect(screen.container.textContent?.match(/メモはありません/g)).toHaveLength(1);
	});

	it('結果の出たレースはふりかえりへ、開催予定は予想画面へ向く', async () => {
		const screen = render(GradedRaceTimeline, { timeline, today: '2026-10-14' });

		await expect
			.element(screen.getByRole('link', { name: /産経賞オールカマー/ }))
			.toHaveAttribute('href', '/races/last');
		await expect
			.element(screen.getByRole('link', { name: /中山11R オールカマー/ }).first())
			.toHaveAttribute('href', '/races/future/preview');
		// 1頭ごとのメモの件数も、同じ行き先（ふりかえり）へのリンクにする。本文は出さない。
		await expect
			.element(screen.getByRole('link', { name: '1頭ごとのメモ 2件' }))
			.toHaveAttribute('href', '/races/last');
		await expect.element(screen.getByText('開催予定')).toBeVisible();
	});

	it('日が過ぎても結果が入っていないレースは、予想画面へ向く', async () => {
		const screen = render(GradedRaceTimeline, {
			timeline: [
				{
					year: '2026',
					races: [{ ...empty, race: { ...base, id: 'noresult', date: '2026-09-27' } }]
				}
			],
			today: '2026-10-14'
		});

		await expect
			.element(screen.getByRole('link', { name: /オールカマー/ }))
			.toHaveAttribute('href', '/races/noresult/preview');
	});
});
