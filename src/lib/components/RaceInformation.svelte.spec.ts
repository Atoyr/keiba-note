import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceInformation from './RaceInformation.svelte';

it('頭数はレースの値を表示し、未取得は—、非重賞には重賞導線を出さない', async () => {
	const screen = render(RaceInformation, {
		race: {
			date: '2026-05-01',
			course: '不明',
			raceNumber: 1,
			name: '見本',
			grade: null,
			className: null,
			surface: null,
			distance: null,
			direction: null,
			weather: null,
			trackCondition: null,
			startTime: null,
			fieldSize: 18
		},
		trend: null,
		sameCondition: []
	});
	await expect.element(screen.getByText('18頭')).toBeInTheDocument();
	expect(document.querySelector('dd')?.parentElement?.textContent).toContain('2026-05-01');
	expect(document.querySelectorAll('dd')).toHaveLength(9);
	expect(document.querySelectorAll('a')).toHaveLength(0);
});

it('基本情報は項目名と値を横に並べた表で、値が無い項目は—を出す', () => {
	render(RaceInformation, {
		race: {
			date: '2026-05-01',
			course: '京都',
			raceNumber: 11,
			name: '見本',
			grade: null,
			className: null,
			surface: '芝',
			distance: 2200,
			direction: null,
			weather: null,
			trackCondition: null,
			startTime: null,
			fieldSize: null
		},
		trend: null,
		sameCondition: []
	});
	const rows = [...document.querySelectorAll('dl > div')];
	expect(rows).toHaveLength(9);
	for (const row of rows) {
		expect(row.className).toContain('grid-cols-3');
		expect(row.querySelector('dt')).not.toBeNull();
		expect(row.querySelector('dd')?.className).toContain('col-span-2');
	}
	const byLabel = new Map(
		rows.map((r) => [r.querySelector('dt')!.textContent, r.querySelector('dd')!.textContent])
	);
	expect(byLabel.get('馬場・距離')).toBe('芝 2200m');
	expect(byLabel.get('開催')).toBe('京都11R');
	expect(byLabel.get('発走')).toBe('—');
	expect(byLabel.get('頭数')).toBe('—');
});
