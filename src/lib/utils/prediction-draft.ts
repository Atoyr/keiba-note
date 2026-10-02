import * as v from 'valibot';
import { predictionDraftSchema, type PredictionDraft } from '$lib/schemas/prediction-draft';
import { emptyFlow, FLOW_PHASES, sortSpots } from '$lib/schemas/race-flow';
import type { FieldValues } from './draft';

/** AI 入力から指定された欄だけを返す。DOM と保存処理には触らない。 */
export function predictionDraftToFields(draft: PredictionDraft): FieldValues {
	const fields: FieldValues = {};
	const race = draft.race;
	if (race?.body !== undefined) fields.raceNoteBody = [race.body];
	if (race?.flow !== undefined) {
		const flow = race.flow ?? emptyFlow();
		fields.racePace = [flow.pace ?? ''];
		for (const p of FLOW_PHASES) {
			fields[`flowSpots.${p}`] = [JSON.stringify(sortSpots(flow[p].spots))];
			fields[`flowMemo.${p}`] = [flow[p].memo];
		}
	}
	if (race?.pace !== undefined) fields.racePace = [race.pace ?? ''];
	for (const entry of draft.entries) {
		if (entry.body !== undefined) fields[`body.${entry.entryId}`] = [entry.body];
		if (entry.mark !== undefined) fields[`mark.${entry.entryId}`] = [entry.mark ?? ''];
		if (entry.tags !== undefined) fields[`tags.${entry.entryId}`] = [...entry.tags];
	}
	return fields;
}

type Rejected = {
	status: 'rejected';
	reason:
		'invalid_input' | 'unknown_entry' | 'duplicate_entry' | 'overlapping_flow' | 'flow_unavailable';
	entryId?: string;
	message?: string;
};

/** 全件を検証してから適用するので、失敗した入力の一部分だけが残ることはない。 */
export function preparePredictionDraft(
	input: unknown,
	entryIds: ReadonlySet<string>
): Rejected | { status: 'ready'; fields: FieldValues } {
	const parsed = v.safeParse(predictionDraftSchema, input);
	if (!parsed.success) {
		return { status: 'rejected', reason: 'invalid_input', message: parsed.issues[0].message };
	}
	const draft = parsed.output;
	const seen = new Set<string>();
	for (const { entryId } of draft.entries) {
		if (!entryIds.has(entryId)) return { status: 'rejected', reason: 'unknown_entry', entryId };
		if (seen.has(entryId)) return { status: 'rejected', reason: 'duplicate_entry', entryId };
		seen.add(entryId);
	}
	if (draft.race?.flow) {
		for (const p of FLOW_PHASES) {
			const horses = new Set<string>();
			const cells = new Set<string>();
			for (const { entryId, x, y } of draft.race.flow[p].spots) {
				if (!entryIds.has(entryId)) return { status: 'rejected', reason: 'unknown_entry', entryId };
				const cell = `${x}:${y}`;
				if (horses.has(entryId) || cells.has(cell)) {
					return { status: 'rejected', reason: 'overlapping_flow', entryId };
				}
				horses.add(entryId);
				cells.add(cell);
			}
		}
	}
	// 出馬表が無いと展開の欄も無い。成功したように見せて値を捨てない。
	if (entryIds.size === 0 && (draft.race?.pace !== undefined || draft.race?.flow !== undefined)) {
		return { status: 'rejected', reason: 'flow_unavailable' };
	}
	return { status: 'ready', fields: predictionDraftToFields(draft) };
}
