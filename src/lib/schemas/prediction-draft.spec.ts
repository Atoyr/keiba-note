import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { MARKS } from './note';
import { emptyFlow } from './race-flow';
import { predictionDraftSchema } from './prediction-draft';

describe('predictionDraftSchema', () => {
	it.each(MARKS)('印 %s と明示クリア・省略を受理する', (mark) => {
		expect(
			v.safeParse(predictionDraftSchema, {
				race: { body: '', pace: null, flow: null },
				entries: [
					{ entryId: 'e1', mark, tags: [] },
					{ entryId: 'e2', mark: null }
				]
			}).success
		).toBe(true);
	});
	it.each([
		{ entries: [{ entryId: 'e1', mark: '本命' }] },
		{ entries: [{ entryId: 'e1', tags: ['未知'] }] },
		{ entries: [{ entryId: 'e1', body: 'あ'.repeat(10001) }] },
		{ race: { body: 'あ'.repeat(10001) }, entries: [] },
		{ race: { pace: '速い' }, entries: [] },
		{
			race: {
				flow: { ...emptyFlow(), start: { spots: [{ entryId: 'e1', x: 10, y: 0 }], memo: '' } }
			},
			entries: []
		},
		{
			race: {
				flow: { ...emptyFlow(), start: { spots: [{ entryId: 'e1', x: 0, y: 4 }], memo: '' } }
			},
			entries: []
		},
		{
			race: { flow: { ...emptyFlow(), start: { spots: [{ entryId: '', x: 0, y: 0 }], memo: '' } } },
			entries: []
		},
		{
			race: {
				flow: { ...emptyFlow(), start: { spots: [{ entryId: 'e1', x: 0.5, y: 0 }], memo: '' } }
			},
			entries: []
		},
		{
			race: { flow: { ...emptyFlow(), start: { spots: [], memo: 'あ'.repeat(201) } } },
			entries: []
		},
		{ entries: [{ entryId: 'e1' }, { entryId: 'e1' }] },
		{ entries: [{ entryId: 'e1', horseId: 'h1' }] },
		{ entries: 'e1' },
		{},
		null
	])('不正入力を拒否する: %j', (input) => {
		expect(v.safeParse(predictionDraftSchema, input).success).toBe(false);
	});
	it('座標・本文の上限と全局面を受理する', () => {
		expect(
			v.safeParse(predictionDraftSchema, {
				race: {
					body: 'あ'.repeat(10000),
					flow: {
						...emptyFlow(),
						pace: 'ハイ',
						finish: { spots: [{ entryId: 'e1', x: 9, y: 3 }], memo: 'あ'.repeat(200) }
					}
				},
				entries: []
			}).success
		).toBe(true);
	});
	it('盤面の馬・マスの重複を拒否する', () => {
		for (const spots of [
			[
				{ entryId: 'e1', x: 0, y: 0 },
				{ entryId: 'e1', x: 1, y: 0 }
			],
			[
				{ entryId: 'e1', x: 0, y: 0 },
				{ entryId: 'e2', x: 0, y: 0 }
			]
		]) {
			expect(
				v.safeParse(predictionDraftSchema, {
					race: { flow: { ...emptyFlow(), start: { spots, memo: '' } } },
					entries: []
				}).success
			).toBe(false);
		}
	});
});
