import { describe, expect, it } from 'vitest';
import { emptyFlow } from '$lib/schemas/race-flow';
import { predictionDraftToFields, preparePredictionDraft } from './prediction-draft';

describe('predictionDraftToFields', () => {
	it('指定された欄だけを既存フォーム名へ変換する', () => {
		expect(
			predictionDraftToFields({
				race: { body: '差し中心', pace: 'ハイ' },
				entries: [{ entryId: 'e1', body: '不利あり', mark: '◎', tags: ['不利'] }, { entryId: 'e2' }]
			})
		).toEqual({
			raceNoteBody: ['差し中心'],
			racePace: ['ハイ'],
			'body.e1': ['不利あり'],
			'mark.e1': ['◎'],
			'tags.e1': ['不利']
		});
		expect(predictionDraftToFields({ entries: [] })).toEqual({});
	});

	it('3局面とメモを出力し、race.pace が flow.pace より優先する', () => {
		const flow = {
			...emptyFlow(),
			pace: 'ミドル' as const,
			start: { spots: [{ entryId: 'e1', x: 2, y: 1 }], memo: '控える' }
		};
		expect(predictionDraftToFields({ race: { flow, pace: 'ハイ' }, entries: [] })).toEqual({
			racePace: ['ハイ'],
			'flowSpots.start': ['[{"entryId":"e1","x":2,"y":1}]'],
			'flowMemo.start': ['控える'],
			'flowSpots.corner4': ['[]'],
			'flowMemo.corner4': [''],
			'flowSpots.finish': ['[]'],
			'flowMemo.finish': ['']
		});
	});

	it('空文字・null・空配列でクリアし、展開だけのクリアで本文に触らない', () => {
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
		const cleared = predictionDraftToFields({ race: { flow: null }, entries: [] });
		expect(cleared).not.toHaveProperty('raceNoteBody');
		expect(cleared.racePace).toEqual(['']);
		expect(cleared['flowSpots.finish']).toEqual(['[]']);
	});
});

describe('preparePredictionDraft', () => {
	const allowed = new Set(['e1', 'e2']);
	it('別レースの馬が混ざれば、本文も含め全体を拒否する', () => {
		expect(
			preparePredictionDraft(
				{
					race: { body: '変更しない' },
					entries: [{ entryId: 'e1', mark: '◎' }, { entryId: 'other' }]
				},
				allowed
			)
		).toEqual({ status: 'rejected', reason: 'unknown_entry', entryId: 'other' });
	});
	it('展開の中の未知の馬も、重なりで隠れた馬も拒否する', () => {
		const flow = {
			...emptyFlow(),
			start: {
				spots: [
					{ entryId: 'e1', x: 0, y: 0 },
					{ entryId: 'other', x: 0, y: 0 }
				],
				memo: ''
			}
		};
		expect(preparePredictionDraft({ race: { flow }, entries: [] }, allowed)).toEqual({
			status: 'rejected',
			reason: 'unknown_entry',
			entryId: 'other'
		});
	});
	it('同じ馬の二重指定と盤面の重なりを拒否する', () => {
		expect(
			preparePredictionDraft({ entries: [{ entryId: 'e1' }, { entryId: 'e1' }] }, allowed)
		).toMatchObject({ reason: 'duplicate_entry' });
		const flow = {
			...emptyFlow(),
			start: {
				spots: [
					{ entryId: 'e1', x: 0, y: 0 },
					{ entryId: 'e2', x: 0, y: 0 }
				],
				memo: ''
			}
		};
		expect(preparePredictionDraft({ race: { flow }, entries: [] }, allowed)).toMatchObject({
			reason: 'overlapping_flow'
		});
	});
	it('出馬表前は本文だけを受け、存在しない展開欄への更新を拒否する', () => {
		expect(preparePredictionDraft({ race: { body: '見立て' }, entries: [] }, new Set())).toEqual({
			status: 'ready',
			fields: { raceNoteBody: ['見立て'] }
		});
		expect(preparePredictionDraft({ race: { pace: null }, entries: [] }, new Set())).toMatchObject({
			reason: 'flow_unavailable'
		});
		expect(preparePredictionDraft({ entries: [] }, allowed)).toEqual({
			status: 'ready',
			fields: {}
		});
		expect(preparePredictionDraft(null, allowed)).toMatchObject({ reason: 'invalid_input' });
	});
});
