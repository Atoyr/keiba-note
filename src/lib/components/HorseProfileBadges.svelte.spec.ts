import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseProfileBadges from './HorseProfileBadges.svelte';

const base = {
	sex: null,
	birthYear: null,
	currentYear: 2026,
	sire: null,
	dam: null,
	trainer: null
} as const;

const items = (root: HTMLElement) =>
	[...root.querySelectorAll('dl > div')].map((el) =>
		[...el.querySelectorAll('dt, dd')].map((e) => e.textContent?.trim())
	);

describe('HorseProfileBadges', () => {
	it('性齢・父・母・調教師を順に出す', () => {
		const screen = render(HorseProfileBadges, {
			...base,
			sex: '牡',
			birthYear: 2022,
			sire: 'チチ',
			dam: 'ハハ',
			trainer: '調教師A'
		});

		expect(items(screen.container)).toEqual([
			['性齢', '牡4'],
			['父', 'チチ'],
			['母', 'ハハ'],
			['調教師', '調教師A']
		]);
	});

	it('性だけなら牡、馬齢だけなら4歳', () => {
		const sexOnly = render(HorseProfileBadges, { ...base, sex: '牝' });
		expect(items(sexOnly.container)).toEqual([['性齢', '牝']]);

		const ageOnly = render(HorseProfileBadges, { ...base, birthYear: 2022 });
		expect(items(ageOnly.container)).toEqual([['性齢', '4歳']]);
	});

	it('null の項目は出さない', () => {
		const screen = render(HorseProfileBadges, { ...base, sire: 'チチ', trainer: '調教師A' });

		expect(items(screen.container)).toEqual([
			['父', 'チチ'],
			['調教師', '調教師A']
		]);
	});

	it('全部 null なら dl 自体を出さない', () => {
		const screen = render(HorseProfileBadges, { ...base });

		expect(screen.container.querySelector('dl')).toBeNull();
	});
});
