import { MARKS, type Mark, type NoteTag } from '../schemas/note';
import { hasResolvedFlow, type ResolvedFlow } from './race-flow';

/** 共有してよい表示項目だけ。アカウント情報や過去メモは含めない。 */
export type RaceSummary = {
	race: { name: string | null; meeting: string; spec: string; grade: string | null };
	body: string;
	/**
	 * 展開の予想。書いていなければ**キーごと持たない。** 展開を入れる前に作った共有のコピーと
	 * 比べたとき、`flow: null` があるだけで「共有後に予想が変わっています」と出てしまうため。
	 */
	flow?: ResolvedFlow;
	rows: {
		horseName: string;
		horseNumber: number | null;
		bracket: number | null;
		body: string;
		mark: Mark | null;
		tags: NoteTag[];
	}[];
};

export const hasSummary = (summary: RaceSummary) =>
	summary.body.length > 0 || summary.rows.length > 0 || hasResolvedFlow(summary.flow);

/** 印なしも残す。共有済みコピーを含め、表示時に同じ順序へ揃える。 */
export function orderedSummaryRows(rows: RaceSummary['rows']): RaceSummary['rows'] {
	const rank = (mark: Mark | null) => (mark === null ? MARKS.length : MARKS.indexOf(mark));
	return [...rows].sort(
		(a, b) => rank(a.mark) - rank(b.mark) || (a.horseNumber ?? 99) - (b.horseNumber ?? 99)
	);
}
