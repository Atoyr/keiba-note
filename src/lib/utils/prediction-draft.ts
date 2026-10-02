import type { PredictionDraft } from '$lib/schemas/prediction-draft';
import { NOTE_TAGS } from '$lib/schemas/note';
import { emptyFlow, FLOW_PHASES, sortSpots } from '$lib/schemas/race-flow';
import type { FieldValues } from './draft';

/** 指定された欄だけを既存のフォーム名へ変換する。DOM と保存経路には触らない。 */
export function predictionDraftToFields(draft: PredictionDraft): FieldValues {
	const fields: FieldValues = {};
	const race = draft.race;
	if (race?.body !== undefined) fields.raceNoteBody = [race.body];
	if (race?.flow !== undefined) {
		const flow = race.flow ?? emptyFlow();
		fields.racePace = [flow.pace ?? ''];
		for (const phase of FLOW_PHASES) {
			fields[`flowSpots.${phase}`] = [JSON.stringify(sortSpots(flow[phase].spots))];
			fields[`flowMemo.${phase}`] = [flow[phase].memo];
		}
	}
	if (race?.pace !== undefined) fields.racePace = [race.pace ?? ''];
	for (const entry of draft.entries) {
		if (entry.body !== undefined) fields[`body.${entry.entryId}`] = [entry.body];
		if (entry.mark !== undefined) fields[`mark.${entry.entryId}`] = [entry.mark ?? ''];
		if (entry.tags !== undefined)
			fields[`tags.${entry.entryId}`] = NOTE_TAGS.filter((tag) => entry.tags!.includes(tag));
	}
	return fields;
}

/** 本文も盤面も、全入力の検証が終わるまで1欄も適用しない。 */
export function unknownPredictionEntry(draft: PredictionDraft, allowed: ReadonlySet<string>) {
	const ids = [
		...draft.entries.map((entry) => entry.entryId),
		...FLOW_PHASES.flatMap((phase) => draft.race?.flow?.[phase].spots.map((s) => s.entryId) ?? [])
	];
	return ids.find((id) => !allowed.has(id));
}
