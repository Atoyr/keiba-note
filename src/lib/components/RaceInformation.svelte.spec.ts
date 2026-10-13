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
