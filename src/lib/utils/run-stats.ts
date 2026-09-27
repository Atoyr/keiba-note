/**
 * ふりかえり画面で、1頭の走りを読むための数字。
 *
 * 着順と上りのタイムだけでは「前で粘ったのか、後ろから届いたのか」「上りが速かったのか」が読めない。
 * どちらも結果（`race_entry`）にもう入っている通過順と上りから出せるので、ここで計算する。
 */

/**
 * 通過順（`5-5-4-2`）から、4コーナーを回った位置を取る。**最後の数字が4コーナー。**
 *
 * コーナーが2つのレース（`3-2`）も、最後は4コーナーを回ったときの位置。
 * 通過順が無い（直線のレース・取消・まだ入っていない）か数字が読めなければ null。
 */
export function corner4Position(passing: string | null): number | null {
	if (!passing) return null;
	const last = passing.split('-').at(-1)?.trim() ?? '';
	if (!/^\d+$/.test(last)) return null;
	const n = Number(last);
	return n > 0 ? n : null;
}

/**
 * 上り（`last3f`）の速い順の順位。出走馬の id → 順位。
 *
 * 同じタイムは同じ順位にし、次の順位はその頭数ぶん飛ばす（33.9・33.9・34.1 なら 1・1・3位）。
 * 競馬新聞の「上がり1位」と同じ数え方。上りが入っていない馬は順位を持たない（Map に入れない）。
 */
export function last3fRanks(
	rows: readonly { entryId: string; last3f: number | null }[]
): Map<string, number> {
	const times = rows.flatMap((r) => (r.last3f === null ? [] : [r.last3f]));
	return new Map(
		rows.flatMap((r) =>
			r.last3f === null
				? []
				: [[r.entryId, times.filter((t) => t < (r.last3f as number)).length + 1] as const]
		)
	);
}
