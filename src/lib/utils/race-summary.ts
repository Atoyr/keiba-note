import { MARKS, type Mark, type NoteTag } from '../schemas/note';

/** 共有してよい表示項目だけ。アカウント情報や過去メモは含めない。 */
export type RaceSummary = {
	race: { name: string | null; meeting: string; spec: string; grade: string | null };
	body: string;
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
	summary.body.length > 0 || summary.rows.length > 0;

/** 印なしも残す。共有済みコピーを含め、表示時に同じ順序へ揃える。 */
export function orderedSummaryRows(rows: RaceSummary['rows']): RaceSummary['rows'] {
	const rank = (mark: Mark | null) => (mark === null ? MARKS.length : MARKS.indexOf(mark));
	return [...rows].sort(
		(a, b) => rank(a.mark) - rank(b.mark) || (a.horseNumber ?? 99) - (b.horseNumber ?? 99)
	);
}
