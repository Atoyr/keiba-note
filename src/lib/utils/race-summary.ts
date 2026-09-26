import type { Mark, NoteTag } from '../schemas/note';

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
