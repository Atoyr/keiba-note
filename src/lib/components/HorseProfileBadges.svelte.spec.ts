import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseProfileBadges from './HorseProfileBadges.svelte';

const empty = { sire: null, dam: null, damSire: null, trainer: null, trainingCenter: null };

/** 段（dl）ごとに、札の dt・dd を並べる。 */
const rows = (root: HTMLElement) =>
	[...root.querySelectorAll('dl')].map((dl) =>
		[...dl.querySelectorAll(':scope > div')].map((el) =>
			[...el.querySelectorAll('dt, dd')].map((e) => e.textContent?.trim())
		)
	);

describe('HorseProfileBadges', () => {
	it('全部 null なら何も描かない（外側の要素も無い）', () => {
		const screen = render(HorseProfileBadges, empty);

		expect(screen.container.querySelector('dl')).toBeNull();
		expect(screen.container.children).toHaveLength(0);
	});

	it('父だけなら1段だけ出す', () => {
		const screen = render(HorseProfileBadges, { ...empty, sire: 'チチ' });

		expect(rows(screen.container)).toEqual([[['父', 'チチ']]]);
	});

	it('全部あれば父、母・母父、所属・調教師の3段で、dt と dd の対になる', () => {
		const screen = render(HorseProfileBadges, {
			sire: 'チチ',
			dam: 'ハハ',
			damSire: 'ハハチチ',
			trainer: '調教師A',
			trainingCenter: '栗東'
		});

		expect(rows(screen.container)).toEqual([
			[['父', 'チチ']],
			[
				['母', 'ハハ'],
				['母父', 'ハハチチ']
			],
			[
				['所属', '栗東'],
				['調教師', '調教師A']
			]
		]);
	});
});
