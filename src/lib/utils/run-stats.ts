/**
 * ふりかえり画面で、1頭の走りを読むための数字。
 *
 * 着順と上りのタイムだけでは「前で粘ったのか、後ろから届いたのか」「上りが速かったのか」が読めない。
 * どちらも結果（`race_entry`）にもう入っている通過順と上りから出せるので、ここで計算する。
 */

import { COURSE_SPECS, isStraightCourse } from './course';

/**
 * コーナーを回るレースか。**直線のレース（新潟の芝1000m）はコーナーが無い**のに、
 * 通過順には数字が1つ（`5`）入っているので、そのまま読むと「4角5番手」と出てしまう。
 * 判定はコース図・展開の盤面と同じ（`isStraightCourse`。回りが空でも距離で決まる）。
 */
export function hasCorners(race: {
	course: string;
	surface: string | null;
	distance: number | null;
	direction: string | null;
}): boolean {
	if (race.direction === '直線') return false;
	const spec = COURSE_SPECS[race.course];
	return !(spec && isStraightCourse(spec, race));
}

/**
 * 通過順（`5-5-4-2`）から、4コーナーを回った位置を取る。**最後の数字が4コーナー。**
 *
 * コーナーが2つのレース（`3-2`）も、最後は4コーナーを回ったときの位置。
 * 通過順が無い（取消・まだ入っていない）か数字が読めなければ null。
 * 直線のレースかどうかはここでは見ない（→ `hasCorners`）。
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
 *
 * **走った全頭の上りがそろっているときだけ数える**（上りの入った頭数が `fieldSize` と同じとき）。
 * 出走馬は気にしている馬だけ入れてよい（data/README.md「重賞でなくてよい」）ので、
 * 入っている馬の中だけで数えると、1頭しか入っていないレースでは6着の馬が「上り1位」になる。
 * 頭数（`fieldSize`）が入っていなければ、全頭そろっているかが分からないので数えない（空の Map）。
 */
export function last3fRanks(
	rows: readonly { entryId: string; last3f: number | null }[],
	fieldSize: number | null
): Map<string, number> {
	const times = rows.flatMap((r) => (r.last3f === null ? [] : [r.last3f]));
	if (fieldSize === null || times.length !== fieldSize) return new Map();
	return new Map(
		rows.flatMap((r) =>
			r.last3f === null
				? []
				: [[r.entryId, times.filter((t) => t < (r.last3f as number)).length + 1] as const]
		)
	);
}
