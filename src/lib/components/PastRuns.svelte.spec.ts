import type { ComponentProps } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PastRuns from './PastRuns.svelte';

// 型はサーバーから引かず、コンポーネントの props から取る（architecture.md 第2章）
type PastRun = ComponentProps<typeof PastRuns>['runs'][number];

const run = (over: Partial<PastRun>): PastRun => ({
	raceId: 'r1',
	date: '2026-08-23',
	course: '札幌',
	raceNumber: 11,
	raceName: '札幌記念',
	grade: 'G2',
	className: null,
	surface: '芝',
	distance: 2000,
	trackCondition: '良',
	fieldSize: null,
	winnerName: null,
	runnerUpName: null,
	timeDiff: null,
	bracket: null,
	horseNumber: null,
	finishPosition: 1,
	popularity: 2,
	last3f: 34.2,
	finishTime: null,
	passing: null,
	jockey: null,
	...over
});

/** 1走ぶんの tbody の、n 番目のセルの文字。 */
const cellsOf = (container: Element, index: number) =>
	[...container.querySelectorAll('tbody')].map((tbody) =>
		tbody.querySelectorAll('tr')[0].querySelectorAll('td')[index].textContent?.trim()
	);

describe('PastRuns', () => {
	it('列の見出し（日付・レース / 着順 / 枠番 / 通過 / 上り / 人気）を表で出す', async () => {
		const screen = render(PastRuns, { runs: [run({})] });

		for (const name of ['日付・レース', '着順', '枠番', '通過', '上り', '人気']) {
			await expect.element(screen.getByRole('columnheader', { name, exact: true })).toBeVisible();
		}
		expect(screen.container.querySelectorAll('th[scope="col"]')).toHaveLength(6);
	});

	it('日付は YY/MM/DD で出す（年をまたいだ5走でも間隔が読める）', async () => {
		const screen = render(PastRuns, { runs: [run({ date: '2025-12-28' })] });

		await expect.element(screen.getByText('25/12/28')).toBeInTheDocument();
	});

	it('レース名・開催場とR・馬場と距離を日付の列に重ねて出す', async () => {
		const screen = render(PastRuns, { runs: [run({ course: '中山', raceNumber: 11 })] });

		const cell = screen.container.querySelector('tbody td')!;
		expect(cell.textContent).toContain('札幌記念');
		expect(cell.textContent).toContain('中山11R');
		expect(cell.textContent).toContain('芝2000m良');
	});

	it('着順は 着順/頭数、頭数が無ければ N着、着順が無くても頭数があれば —/頭数、どちらも無ければ —', () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', finishPosition: 3, fieldSize: 16 }),
				run({ raceId: 'r2', finishPosition: 5, fieldSize: null }),
				run({ raceId: 'r3', finishPosition: null, fieldSize: 16 }),
				run({ raceId: 'r4', finishPosition: null, fieldSize: null })
			]
		});

		expect(cellsOf(screen.container, 1)).toEqual(['3/16', '5着', '—/16', '—']);
	});

	it('1着は赤の太字、5着以内は強め、着順の無い走は薄い色にする', () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', finishPosition: 1 }),
				run({ raceId: 'r2', finishPosition: 4 }),
				run({ raceId: 'r3', finishPosition: null })
			]
		});

		const classes = [...screen.container.querySelectorAll('tbody')].map(
			(tbody) => tbody.querySelectorAll('td')[1].className
		);
		expect(classes[0]).toContain('text-red-700');
		expect(classes[1]).toContain('font-medium');
		expect(classes[2]).toContain('text-muted-foreground');
	});

	it('枠番の列は 枠-馬番、片方だけなら単位を付けて 枠・番、どちらも無ければ —', () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', bracket: 3, horseNumber: 5 }),
				run({ raceId: 'r2', horseNumber: 7 }),
				run({ raceId: 'r3', bracket: 2 }),
				run({ raceId: 'r4' })
			]
		});

		expect(cellsOf(screen.container, 2)).toEqual(['3-5', '7番', '2枠', '—']);
	});

	it('通過・上り・人気は専用の列に出し、無ければ —', () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', passing: '5-5-4-2', last3f: 33.4, popularity: 2 }),
				run({ raceId: 'r2', passing: null, last3f: null, popularity: null })
			]
		});

		expect(cellsOf(screen.container, 3)).toEqual(['5-5-4-2', '—']);
		expect(cellsOf(screen.container, 4)).toEqual(['33.4', '—']);
		expect(cellsOf(screen.container, 5)).toEqual(['2', '—']);
	});

	it('2段目に騎手を出す（見出しは読み上げだけ）', async () => {
		const screen = render(PastRuns, { runs: [run({ jockey: 'ルメール' })] });

		const sub = screen.container.querySelectorAll('tbody tr')[1];
		expect(sub.textContent).toContain('騎手ルメール');
		await expect.element(screen.getByText('騎手', { exact: true })).toHaveClass(/sr-only/);
	});

	it('騎手名は騎手の画面へのリンク（点線の下線）', async () => {
		const screen = render(PastRuns, { runs: [run({ jockey: 'C.ルメール' })] });

		const link = screen.getByRole('link', { name: 'C.ルメール' });
		await expect
			.element(link)
			.toHaveAttribute('href', `/jockeys/${encodeURIComponent('C.ルメール')}`);
		await expect.element(link).toHaveClass(/decoration-dotted/);
		// sr-only の「騎手」は残す
		await expect.element(screen.getByText('騎手', { exact: true })).toHaveClass(/sr-only/);
	});

	it('G1〜G3 でレース名のある走は、レース名が重賞の画面へのリンクになる', async () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', raceName: '札幌記念', grade: 'G2' }),
				run({ raceId: 'r2', raceName: '1勝クラス特別', grade: null, className: '1勝' }),
				run({ raceId: 'r3', raceName: 'リステッド競走', grade: 'L' }),
				run({ raceId: 'r4', raceName: null, grade: 'G3' })
			]
		});

		const links = [...screen.container.querySelectorAll('tbody a[href^="/graded-races/"]')];
		expect(links).toHaveLength(1);
		expect(links[0].textContent).toBe('札幌記念');
		expect(links[0].getAttribute('href')).toBe(`/graded-races/${encodeURIComponent('札幌記念')}`);
		// 条件戦・L・OP・名前の無い走は今までどおり文字のまま
		const text = screen.container.textContent ?? '';
		expect(text).toContain('1勝クラス特別');
		expect(text).toContain('リステッド競走');
		expect(screen.container.querySelectorAll('tbody a')).toHaveLength(1);
	});

	it('負けた走は勝ち馬とタイム差を出す', async () => {
		const screen = render(PastRuns, {
			runs: [
				run({ finishPosition: 4, winnerName: '勝ち馬X', runnerUpName: '2着馬Y', timeDiff: 0.4 })
			]
		});

		await expect.element(screen.getByText('勝ち馬X（0.4）')).toBeInTheDocument();
		const sub = screen.container.querySelectorAll('tbody tr')[1];
		expect(sub.textContent).toContain('勝ち馬勝ち馬X（0.4）');
		expect(sub.textContent).not.toContain('2着馬Y');
	});

	it('勝った走は2着馬と、2着につけた差を負で出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: 1, winnerName: '自分', runnerUpName: '2着馬Y', timeDiff: -0.2 })]
		});

		await expect.element(screen.getByText('2着馬Y（-0.2）')).toBeInTheDocument();
		await expect.element(screen.getByText('2着馬', { exact: true })).toHaveClass(/sr-only/);
	});

	it('着順の無い走（取消・結果が未入力）には勝ち馬を出さない', () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: null, winnerName: '勝ち馬X', horseNumber: 5 })]
		});

		const body = screen.container.querySelector('tbody')!;
		expect(body.textContent).not.toContain('勝ち馬X');
		expect(cellsOf(screen.container, 1)).toEqual(['—']);
		expect(cellsOf(screen.container, 2)).toEqual(['5番']);
	});

	it('差が 0 の走（ハナ差・同着）も 0.0 と出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: 2, winnerName: '勝ち馬X', timeDiff: 0 })]
		});

		await expect.element(screen.getByText('勝ち馬X（0.0）')).toBeInTheDocument();
	});

	it('走破タイムを読み上げ用の見出しを付けて2段目に出す', async () => {
		const screen = render(PastRuns, { runs: [run({ finishTime: '1:58.4' })] });

		const sub = screen.container.querySelectorAll('tbody tr')[1];
		expect(sub.textContent).toContain('タイム1:58.4');
		// 見出しの語は画面には出さない（形で見分けが付く）
		await expect.element(screen.getByText('タイム', { exact: true })).toHaveClass(/sr-only/);
	});

	it('騎手・勝ち馬・タイムのどれも無い走は2段目ごと出さない', () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: null, popularity: null, last3f: null })]
		});

		expect(screen.container.querySelectorAll('tbody tr')).toHaveLength(1);
		expect(screen.container.querySelector('tbody')!.textContent).toContain('—');
	});

	it('0走なら表を出さず、記録が無いと伝える', async () => {
		const screen = render(PastRuns, { runs: [] });

		await expect.element(screen.getByText('過去走の記録がありません。')).toBeVisible();
		expect(screen.container.querySelector('table')).toBeNull();
	});

	it('表は狭い幅でもページを広げないよう、横に動く箱に入れる', () => {
		const screen = render(PastRuns, { runs: [run({})] });

		expect(screen.container.querySelector('table')?.parentElement?.className).toContain(
			'overflow-x-auto'
		);
	});

	describe('各レースの過去メモ', () => {
		const note = { id: 'n1', kind: 'entry', body: '直線で詰まった', tags: [], mark: null };

		it('メモのある走だけを、表の下のかたまりに新しい順で出す', async () => {
			const screen = render(PastRuns, {
				runs: [
					run({ raceId: 'r1', date: '2026-06-08', raceName: '安田記念', notes: [note] }),
					run({ raceId: 'r2', date: '2026-05-01', raceName: 'メモ無し賞' }),
					run({
						raceId: 'r3',
						date: '2026-04-01',
						raceName: '古いメモ賞',
						notes: [{ ...note, id: 'n3', kind: 'preview', body: '前に書いた' }]
					})
				]
			});

			await expect
				.element(screen.getByRole('heading', { name: '各レースの過去メモ（自分のメモ）' }))
				.toBeVisible();
			const items = screen.container.querySelectorAll('section ol > li');
			expect(items).toHaveLength(2);
			expect(items[0].textContent).toContain('26/06/08');
			expect(items[0].textContent).toContain('安田記念');
			expect(items[0].textContent).toContain('ふりかえり');
			expect(items[0].textContent).toContain('直線で詰まった');
			expect(items[1].textContent).toContain('古いメモ賞');
			expect(items[1].textContent).toContain('出走前');
			expect(items[0].textContent).not.toContain('メモ無し賞');
			await expect
				.element(screen.getByRole('link', { name: 'この走りの画面でメモを確認・編集する' }).first())
				.toHaveAttribute('href', '/races/r1');
		});

		it('メモのある走が1つも無ければ、かたまりごと出さない', () => {
			const screen = render(PastRuns, { runs: [run({}), run({ raceId: 'r2', notes: [] })] });

			expect(screen.container.querySelector('section')).toBeNull();
			expect(screen.container.querySelector('h4')).toBeNull();
		});
	});
});

describe('PastRuns のレース名', () => {
	it('長いレース名は条件戦も重賞も省略せず、切るクラスを持たない', () => {
		const { container } = render(PastRuns, {
			runs: [
				run({ raceId: 'a', raceName: 'ラジオN杯京都2歳S', grade: null, className: '2歳オープン' }),
				run({ raceId: 'b', raceName: 'ラジオN杯京都2歳S', grade: 'G2' })
			]
		});

		const names = [...container.querySelectorAll('tbody')].map((tbody) => {
			const cell = tbody.querySelectorAll('td')[0];
			return [...cell.querySelectorAll('a, p')].find((el) =>
				el.textContent?.includes('ラジオN杯京都2歳S')
			);
		});
		expect(names).toHaveLength(2);
		for (const el of names) {
			expect(el?.textContent?.trim()).toBe('ラジオN杯京都2歳S');
			expect(el?.className).not.toContain('truncate');
			expect(el?.className).not.toContain('line-clamp');
		}
	});
});
