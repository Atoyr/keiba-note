import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { raceFlowFormSchema, restrictFlowTo, type RaceFlowFormInput } from './race-flow';

const form = (over: Partial<RaceFlowFormInput> = {}): RaceFlowFormInput => ({
	pace: '',
	start: { spots: '', memo: '' },
	corner4: { spots: '', memo: '' },
	finish: { spots: '', memo: '' },
	...over
});

const spots = (xs: { entryId: string; x: number; y: number }[]) => JSON.stringify(xs);

describe('raceFlowFormSchema', () => {
	it('何も書いていなければ null（見立ての行に展開を付けない）', () => {
		expect(v.parse(raceFlowFormSchema, form())).toBeNull();
		expect(v.parse(raceFlowFormSchema, form({ start: { spots: '[]', memo: '  ' } }))).toBeNull();
	});

	it('ペースだけでも展開として残す', () => {
		expect(v.parse(raceFlowFormSchema, form({ pace: 'ハイ' }))).toMatchObject({ pace: 'ハイ' });
	});

	it('選択肢に無いペースは「なし」にする', () => {
		expect(v.parse(raceFlowFormSchema, form({ pace: '超ハイ' }))).toBeNull();
	});

	/** 置いた順で持つと、同じ盤面でも保存のたびに JSON が変わる。 */
	it('隊列は前から後ろ・内から外の順に揃える', () => {
		const out = v.parse(
			raceFlowFormSchema,
			form({
				corner4: {
					spots: spots([
						{ entryId: 'c', x: 3, y: 0 },
						{ entryId: 'b', x: 0, y: 1 },
						{ entryId: 'a', x: 0, y: 0 }
					]),
					memo: ' 外から押し上げる '
				}
			})
		);
		expect(out?.corner4).toEqual({
			spots: [
				{ entryId: 'a', x: 0, y: 0 },
				{ entryId: 'b', x: 0, y: 1 },
				{ entryId: 'c', x: 3, y: 0 }
			],
			memo: '外から押し上げる'
		});
	});

	it('同じ馬・同じマスが重なっていたら、先に来たほうだけを残す', () => {
		const out = v.parse(
			raceFlowFormSchema,
			form({
				start: {
					spots: spots([
						{ entryId: 'a', x: 0, y: 0 },
						{ entryId: 'a', x: 5, y: 1 },
						{ entryId: 'b', x: 0, y: 0 }
					]),
					memo: ''
				}
			})
		);
		expect(out?.start.spots).toEqual([{ entryId: 'a', x: 0, y: 0 }]);
	});

	it('盤面の外のマスや壊れた JSON は弾く', () => {
		expect(
			v.safeParse(
				raceFlowFormSchema,
				form({ start: { spots: spots([{ entryId: 'a', x: 10, y: 0 }]), memo: '' } })
			).success
		).toBe(false);
		expect(
			v.safeParse(
				raceFlowFormSchema,
				form({ start: { spots: spots([{ entryId: 'a', x: 0, y: 4 }]), memo: '' } })
			).success
		).toBe(false);
		const broken = v.safeParse(raceFlowFormSchema, form({ start: { spots: '[{', memo: '' } }));
		expect(broken.success).toBe(false);
		expect(broken.issues?.[0]?.message).toBe('展開の隊列を読み取れませんでした');
	});

	it('一言メモは200文字まで', () => {
		const long = v.safeParse(
			raceFlowFormSchema,
			form({ finish: { spots: '', memo: 'あ'.repeat(201) } })
		);
		expect(long.issues?.[0]?.message).toBe('展開のメモは200文字までです');
	});
});

describe('restrictFlowTo', () => {
	const flow = v.parse(
		raceFlowFormSchema,
		form({
			start: {
				spots: spots([
					{ entryId: 'mine', x: 0, y: 0 },
					{ entryId: 'other-race', x: 1, y: 0 }
				]),
				memo: ''
			}
		})
	);

	/** フォームの id を鵜呑みにすると、他のレースの馬を盤面に置けてしまう。 */
	it('このレースの出走馬でない馬を落とす', () => {
		expect(restrictFlowTo(flow, new Set(['mine']))?.start.spots).toEqual([
			{ entryId: 'mine', x: 0, y: 0 }
		]);
	});

	it('落とした結果が空なら null', () => {
		expect(restrictFlowTo(flow, new Set())).toBeNull();
		expect(restrictFlowTo(null, new Set(['mine']))).toBeNull();
	});
});
