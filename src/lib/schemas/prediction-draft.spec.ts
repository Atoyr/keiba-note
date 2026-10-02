import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { emptyFlow } from './race-flow';
import { predictionDraftSchema } from './prediction-draft';

describe('predictionDraftSchema', () => {
	it('印・札・展開を受け、札は既存順序にそろえる', () => {
		const output = v.parse(predictionDraftSchema, {
			race: { body: '見立て', pace: 'ハイ', flow: emptyFlow() },
			entries: [{ entryId: 'e1', mark: '◎', tags: ['不利', '次走買い', '不利'] }]
		});
		expect(output.entries[0]).toEqual({ entryId: 'e1', mark: '◎', tags: ['次走買い', '不利'] });
	});

	it.each([
		{ entries: [{ entryId: 'e1', mark: '★' }] },
		{ entries: [{ entryId: 'e1', tags: ['未知の札'] }] },
		{ entries: [{ entryId: 'e1', body: 'x'.repeat(10001) }] },
		{ race: { body: 'x'.repeat(10001) }, entries: [] },
		{ race: { pace: '速い' }, entries: [] },
		{ entries: null },
		{ race: { body: null }, entries: [] },
		{ entries: [{ entryId: 'e1', tags: null }] },
		{ race: { flow: {} }, entries: [] },
		{ entries: [], save: true },
		{ entries: [{ entryId: '' }] },
		null
	])('不正な印・札・本文・構造を拒否する: %j', (input) => {
		expect(v.safeParse(predictionDraftSchema, input).success).toBe(false);
	});

	it.each([
		{ x: -1, y: 0 },
		{ x: 10, y: 0 },
		{ x: 0, y: 4 },
		{ x: 1.5, y: 0 }
	])('盤面外や小数の座標を拒否する: %j', (cell) => {
		const flow = { ...emptyFlow(), start: { spots: [{ entryId: 'e1', ...cell }], memo: '' } };
		expect(v.safeParse(predictionDraftSchema, { race: { flow }, entries: [] }).success).toBe(false);
	});

	it('上限ちょうどと明示クリアを受け、未指定に既定値を足さない', () => {
		expect(
			v.parse(predictionDraftSchema, {
				race: { body: 'x'.repeat(10000), pace: null, flow: null },
				entries: [{ entryId: 'e1', body: '', mark: null, tags: [] }, { entryId: 'e2' }]
			}).entries
		).toEqual([{ entryId: 'e1', body: '', mark: null, tags: [] }, { entryId: 'e2' }]);
	});

	it('展開のメモの上限も共通規則で検証する', () => {
		const flow = { ...emptyFlow(), finish: { spots: [], memo: 'x'.repeat(201) } };
		expect(v.safeParse(predictionDraftSchema, { race: { flow }, entries: [] }).success).toBe(false);
	});
});
