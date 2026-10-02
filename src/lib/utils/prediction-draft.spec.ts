import { describe, expect, it } from 'vitest';
import { emptyFlow } from '$lib/schemas/race-flow';
import { predictionDraftToFields, unknownPredictionEntry } from './prediction-draft';

describe('predictionDraftToFields', () => {
	it('本文・ペース・印・札を変換し、省略された馬と欄を出さない', () => {
		expect(
			predictionDraftToFields({
				race: { body: '見立て', pace: 'ハイ' },
				entries: [
					{ entryId: 'e1', body: '予想', mark: '◎', tags: ['不利', '次走買い', '不利'] },
					{ entryId: 'e2' }
				]
			})
		).toEqual({
			raceNoteBody: ['見立て'],
			racePace: ['ハイ'],
			'body.e1': ['予想'],
			'mark.e1': ['◎'],
			'tags.e1': ['次走買い', '不利']
		});
	});
	it('展開の全局面とメモを変換する', () => {
		const flow = {
			...emptyFlow(),
			start: { spots: [{ entryId: 'e1', x: 0, y: 0 }], memo: 'ハナ' }
		};
		expect(predictionDraftToFields({ race: { flow }, entries: [] })).toEqual({
			racePace: [''],
			'flowSpots.start': ['[{"entryId":"e1","x":0,"y":0}]'],
			'flowMemo.start': ['ハナ'],
			'flowSpots.corner4': ['[]'],
			'flowMemo.corner4': [''],
			'flowSpots.finish': ['[]'],
			'flowMemo.finish': ['']
		});
	});
	it('明示クリアと省略を区別する', () => {
		expect(predictionDraftToFields({ entries: [] })).toEqual({});
		expect(
			predictionDraftToFields({
				race: { body: '', pace: null },
				entries: [{ entryId: 'e1', body: '', mark: null, tags: [] }]
			})
		).toEqual({
			raceNoteBody: [''],
			racePace: [''],
			'body.e1': [''],
			'mark.e1': [''],
			'tags.e1': []
		});
		expect(
			Object.keys(predictionDraftToFields({ race: { flow: null }, entries: [] }))
		).toHaveLength(7);
	});
	it('予想と盤面の未知IDを検出する', () => {
		const allowed = new Set(['e1']);
		expect(unknownPredictionEntry({ entries: [{ entryId: 'other' }] }, allowed)).toBe('other');
		expect(
			unknownPredictionEntry(
				{
					race: {
						flow: {
							...emptyFlow(),
							finish: { spots: [{ entryId: 'other', x: 0, y: 0 }], memo: '' }
						}
					},
					entries: []
				},
				allowed
			)
		).toBe('other');
		expect(unknownPredictionEntry({ entries: [{ entryId: 'e1' }] }, allowed)).toBeUndefined();
	});
});
