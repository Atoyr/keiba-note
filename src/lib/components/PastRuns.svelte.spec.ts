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

describe('PastRuns', () => {
	it('日付は YY/MM/DD で出す（年をまたいだ5走でも間隔が読める）', async () => {
		const screen = render(PastRuns, { runs: [run({ date: '2025-12-28' })] });

		await expect.element(screen.getByText('25/12/28')).toBeInTheDocument();
	});

	it('2行目の左に頭数・枠・馬番と騎手を出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ fieldSize: 16, bracket: 3, horseNumber: 5, jockey: 'ルメール' })]
		});

		await expect.element(screen.getByText('16頭 3枠5番')).toBeInTheDocument();
		// 騎手の見出しは読み上げだけ
		await expect.element(screen.getByRole('listitem')).toHaveTextContent('騎手ルメール');
		await expect.element(screen.getByText('騎手', { exact: true })).toHaveClass(/sr-only/);
	});

	it('負けた走は勝ち馬とタイム差を出す', async () => {
		const screen = render(PastRuns, {
			runs: [
				run({ finishPosition: 4, winnerName: '勝ち馬X', runnerUpName: '2着馬Y', timeDiff: 0.4 })
			]
		});

		await expect.element(screen.getByText('勝ち馬X（0.4）')).toBeInTheDocument();
		await expect.element(screen.getByRole('listitem')).toHaveTextContent('勝ち馬勝ち馬X（0.4）');
		await expect.element(screen.getByRole('listitem')).not.toHaveTextContent('2着馬Y');
	});

	it('勝った走は2着馬と、2着につけた差を負で出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: 1, winnerName: '自分', runnerUpName: '2着馬Y', timeDiff: -0.2 })]
		});

		await expect.element(screen.getByText('2着馬Y（-0.2）')).toBeInTheDocument();
		await expect.element(screen.getByText('2着馬', { exact: true })).toHaveClass(/sr-only/);
	});

	it('着順の無い走（取消・結果が未入力）には勝ち馬を出さない', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: null, winnerName: '勝ち馬X', horseNumber: 5 })]
		});

		await expect.element(screen.getByRole('listitem')).toHaveTextContent('5番');
		await expect.element(screen.getByRole('listitem')).not.toHaveTextContent('勝ち馬X');
	});

	it('差が 0 の走（ハナ差・同着）も 0.0 と出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: 2, winnerName: '勝ち馬X', timeDiff: 0 })]
		});

		await expect.element(screen.getByText('勝ち馬X（0.0）')).toBeInTheDocument();
	});

	it('頭数が入っていない走は枠・馬番だけ、枠も無ければ馬番だけ出す', async () => {
		const screen = render(PastRuns, {
			runs: [
				run({ raceId: 'r1', bracket: 3, horseNumber: 5 }),
				run({ raceId: 'r2', horseNumber: 7 })
			]
		});

		await expect.element(screen.getByText('3枠5番', { exact: true })).toBeInTheDocument();
		await expect.element(screen.getByText('7番', { exact: true })).toBeInTheDocument();
		await expect.element(screen.getByRole('list')).not.toHaveTextContent('頭');
	});

	it('タイムと通過順を、読み上げ用の見出しを付けて2行目に出す', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishTime: '1:58.4', passing: '5-5-4-2' })]
		});

		const item = screen.getByRole('listitem');
		await expect.element(item).toHaveTextContent('タイム1:58.4');
		await expect.element(item).toHaveTextContent('通過順5-5-4-2');
		// 見出しの語は画面には出さない（形で見分けが付く）
		await expect.element(screen.getByText('タイム', { exact: true })).toHaveClass(/sr-only/);
	});

	it('片方だけ入っていれば、その片方だけ出す', async () => {
		const screen = render(PastRuns, { runs: [run({ passing: '3-3' })] });

		const item = screen.getByRole('listitem');
		await expect.element(item).toHaveTextContent('通過順3-3');
		await expect.element(item).not.toHaveTextContent('タイム');
	});

	it('頭数・馬番・騎手・勝ち馬・タイム・通過順のどれも無い走は2行目ごと出さない', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: null, popularity: null, last3f: null })]
		});

		await expect.element(screen.getByRole('listitem')).toHaveTextContent('—');
		expect(screen.container.querySelector('.basis-full')).toBeNull();
	});
});
