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
	finishPosition: 1,
	popularity: 2,
	last3f: 34.2,
	finishTime: null,
	passing: null,
	...over
});

describe('PastRuns', () => {
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

	it('どちらも無い走（結果が未入力）は2行目ごと出さない', async () => {
		const screen = render(PastRuns, {
			runs: [run({ finishPosition: null, popularity: null, last3f: null })]
		});

		await expect.element(screen.getByRole('listitem')).toHaveTextContent('—');
		expect(screen.container.querySelector('.basis-full')).toBeNull();
	});
});
