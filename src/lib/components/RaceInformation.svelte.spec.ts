import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceInformation from './RaceInformation.svelte';

const race = {
	date: '2026-05-01',
	course: '京都',
	raceNumber: 11,
	name: '見本',
	grade: null,
	className: null,
	surface: '芝',
	distance: 2200,
	direction: '右',
	weather: null,
	trackCondition: null
};

it('基本情報は出さない（見出しに載せている）。非重賞には重賞導線を出さない', () => {
	const screen = render(RaceInformation, { race, trend: null, sameCondition: [] });
	expect(screen.container.querySelector('dl')).toBeNull();
	expect(screen.container.textContent).not.toContain('基本情報');
	expect(screen.container.querySelector('a')).toBeNull();
});

it('重賞の傾向 → 過去成績・レースメモ → コースの順に並べる', async () => {
	const screen = render(RaceInformation, {
		race: { ...race, course: '東京', name: '毎日王冠', grade: 'G2', surface: '芝', distance: 1800 },
		trend: { key: '毎日王冠', body: '逃げ馬が残りやすい' },
		sameCondition: []
	});
	await expect.element(screen.getByText('逃げ馬が残りやすい')).toBeInTheDocument();
	const root = screen.container.firstElementChild!;
	const order = [...root.children].map((el) => el.getAttribute('aria-label') ?? el.tagName);
	const trendIndex = [...root.children].findIndex((el) =>
		el.textContent?.includes('逃げ馬が残りやすい')
	);
	const pastIndex = order.indexOf('過去成績・レースメモ');
	expect(trendIndex).toBeGreaterThanOrEqual(0);
	expect(pastIndex).toBeGreaterThan(trendIndex);
	// コースは最後（コースの図があるレースでは過去成績より後ろ）
	const courseIndex = [...root.children].findIndex(
		(el) => el.querySelector('[aria-label="コース"]') || el.getAttribute('aria-label') === 'コース'
	);
	expect(courseIndex).toBeGreaterThan(pastIndex);
});
