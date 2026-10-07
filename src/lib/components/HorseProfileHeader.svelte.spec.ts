import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import HorseProfileHeader from './HorseProfileHeader.svelte';

const heading = createRawSnippet(() => ({ render: () => '<h1>テスト馬</h1>' }));
const actions = createRawSnippet(() => ({ render: () => '<button>★</button>' }));

const base = {
	heading,
	actions,
	sex: null,
	birthDate: null,
	birthYear: null,
	sire: null,
	dam: null,
	damSire: null,
	trainer: null,
	trainingCenter: null
} as const;

/** 行（dl）ごとに、札の dt・dd を並べる。 */
const rows = (root: HTMLElement) =>
	[...root.querySelectorAll('dl')].map((dl) =>
		[...dl.querySelectorAll(':scope > div')].map((el) =>
			[...el.querySelectorAll('dt, dd')].map((e) => e.textContent?.trim())
		)
	);

describe('HorseProfileHeader', () => {
	it('1行目に性別、2行目に父、3行目に母・母父、4行目に生年月日・所属・調教師を出す', () => {
		const screen = render(HorseProfileHeader, {
			...base,
			sex: '牡',
			birthDate: '2021-04-04',
			birthYear: 2021,
			sire: 'チチ',
			dam: 'ハハ',
			damSire: 'ハハチチ',
			trainer: '調教師A',
			trainingCenter: '栗東'
		});

		expect(rows(screen.container)).toEqual([
			[['性別', '牡']],
			[['父', 'チチ']],
			[
				['母', 'ハハ'],
				['母父', 'ハハチチ']
			],
			[
				['生年月日', '2021年4月4日生'],
				['所属', '栗東'],
				['調教師', '調教師A']
			]
		]);
		expect(screen.container.querySelector('h1')?.textContent).toBe('テスト馬');
		expect(screen.container.querySelector('button')?.textContent).toBe('★');
	});

	it('性別の札は名前の左、★は右端', () => {
		const screen = render(HorseProfileHeader, { ...base, sex: '牝' });
		const top = screen.container.querySelector(':scope > div > div')!;
		const kids = [...top.children].map((e) => e.tagName);
		expect(kids).toEqual(['DL', 'H1', 'DIV']);
		expect(top.lastElementChild?.className).toContain('ms-auto');
	});

	it('生年月日の月日は0埋めしない。生年月日が無く生年だけなら2021年生', () => {
		const full = render(HorseProfileHeader, { ...base, birthDate: '2022-12-05' });
		expect(rows(full.container)).toEqual([[['生年月日', '2022年12月5日生']]]);

		const yearOnly = render(HorseProfileHeader, { ...base, birthYear: 2021 });
		expect(rows(yearOnly.container)).toEqual([[['生年', '2021年生']]]);
	});

	it('馬齢は出さない', () => {
		const screen = render(HorseProfileHeader, { ...base, sex: '牝', birthYear: 2022 });
		expect(screen.container.textContent).not.toMatch(/\d歳|牝\d/);
	});

	it('null の項目は出さない。項目が1つも無い行は描かない', () => {
		const screen = render(HorseProfileHeader, { ...base, sire: 'チチ', trainer: '調教師A' });

		expect(rows(screen.container)).toEqual([[['父', 'チチ']], [['調教師', '調教師A']]]);
	});

	it('所属だけ・調教師だけでも4行目に出る', () => {
		const center = render(HorseProfileHeader, { ...base, trainingCenter: '美浦' });
		expect(rows(center.container)).toEqual([[['所属', '美浦']]]);

		const trainer = render(HorseProfileHeader, { ...base, trainer: '調教師B' });
		expect(rows(trainer.container)).toEqual([[['調教師', '調教師B']]]);
	});

	it('母だけ・母父だけでも出る', () => {
		const damOnly = render(HorseProfileHeader, { ...base, dam: 'ハハ' });
		expect(rows(damOnly.container)).toEqual([[['母', 'ハハ']]]);

		const damSireOnly = render(HorseProfileHeader, { ...base, damSire: 'ハハチチ' });
		expect(rows(damSireOnly.container)).toEqual([[['母父', 'ハハチチ']]]);
	});

	it('全部 null なら heading と actions だけで dl は出さない', () => {
		const screen = render(HorseProfileHeader, { ...base });

		expect(screen.container.querySelector('dl')).toBeNull();
		expect(screen.container.querySelector('h1')).not.toBeNull();
	});
});
