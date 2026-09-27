/**
 * ふりかえり画面で、1頭の走りを読むための数字。
 *
 * 着順と上りのタイムだけでは「前で粘ったのか、後ろから届いたのか」「上りが速かったのか」が読めない。
 * どちらも結果（`race_entry`）にもう入っている通過順と上りから出せるので、ここで計算する。
 */

import { COURSE_SPECS, isStraightCourse } from './course';
import { flowColumns, type FlowHorse } from './race-flow';

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
 * **走った全頭の上りがそろっているときだけ数える**（上りの入った頭数と、競走中止の頭数を足すと
 * `fieldSize` になるとき）。中止の馬は走ったので頭数に入るが、上りが無い。数えから外さないと、
 * 中止が1頭いるだけで順位が全部消える。中止は「着順も上りも無いのに通過順がある馬」とみなす
 * （取消・除外は通過順も無く、頭数にも入らない）。1コーナーより前で止まった中止は通過順も無く
 * 取消と見分けられないので、そのレースは数えない（安全側）。
 * 出走馬は気にしている馬だけ入れてよい（data/README.md「重賞でなくてよい」）ので、
 * 入っている馬の中だけで数えると、1頭しか入っていないレースでは6着の馬が「上り1位」になる。
 * 頭数（`fieldSize`）が入っていなければ、全頭そろっているかが分からないので数えない（空の Map）。
 */
export function last3fRanks(
	rows: readonly {
		entryId: string;
		last3f: number | null;
		finishPosition: number | null;
		passing: string | null;
	}[],
	fieldSize: number | null
): Map<string, number> {
	const times = rows.flatMap((r) => (r.last3f === null ? [] : [r.last3f]));
	const stopped = rows.filter(
		(r) => r.last3f === null && r.finishPosition === null && !!r.passing
	).length;
	if (fieldSize === null || times.length + stopped !== fieldSize) return new Map();
	return new Map(
		rows.flatMap((r) =>
			r.last3f === null
				? []
				: [[r.entryId, times.filter((t) => t < (r.last3f as number)).length + 1] as const]
		)
	);
}

/** 通過順の区切りの数（`5-5-4-2` なら 4）。通過順が無ければ 0。 */
const passingLength = (passing: string | null) => (passing ? passing.split('-').length : 0);

/**
 * レースの全馬の4コーナーの位置。出走馬の id → 位置。
 *
 * `corner4Position` を1頭ずつ当てるだけでは足りない。**競走中止の馬は通過順が途中で切れる**
 * （4つコーナーのあるレースで `4-4-13`）ので、最後の数字は4コーナーではなく止まる前のコーナー。
 * そこで、完走した馬の通過順の区切りの数（そのレースのコーナーの数）より短い馬は位置を持たない。
 * 4コーナーを回ってから止まった馬（`10-10-14-18`）は区切りの数が同じなので位置を持つ。
 * 直線のレース（`hasCorners` が false）は誰も持たない。
 */
export function corner4Positions(
	rows: readonly { entryId: string; finishPosition: number | null; passing: string | null }[],
	race: Parameters<typeof hasCorners>[0]
): Map<string, number> {
	if (!hasCorners(race)) return new Map();
	const finished = rows.filter((r) => r.finishPosition !== null);
	const corners = Math.max(
		0,
		...(finished.length > 0 ? finished : rows).map((r) => passingLength(r.passing))
	);
	return new Map(
		rows.flatMap((r) => {
			const at = passingLength(r.passing) === corners ? corner4Position(r.passing) : null;
			return at === null ? [] : [[r.entryId, at] as const];
		})
	);
}

type ActualFlowSource = FlowHorse & {
	entryId: string;
	finishPosition: number | null;
	passing: string | null;
};

/**
 * 実際の展開。4コーナーとゴール前の隊列を、予想の隊列と同じ1行の形（`③-⑤⑦-⑪`）で返す。
 *
 * 予想で展開を置いていなくても、どう流れたかは結果から読める（4角は通過順、ゴール前は着順）。
 * 同じ位置の馬（同じ通過順・同着）は1つの列にまとめ、列の中は馬番の順。
 * **内外は結果に無い**ので、前後の順だけを出す（予想の盤面のように内外を描かない）。
 *
 * **走った全頭がそろっているときだけ出す**（着順か通過順のある馬の数が `fieldSize` と同じとき）。
 * 気にしている馬だけ入れたレースで並べると、2頭だけの「隊列」が全体の流れのように読める。
 * 4角は、そのうえで完走した全馬が4角の位置を持つときだけ（直線のレースは出さない）。
 * どちらも出せなければ null。
 */
export function actualFlow(
	rows: readonly ActualFlowSource[],
	race: Parameters<typeof hasCorners>[0] & { fieldSize: number | null }
): { corner4: string[] | null; finish: string[] | null } | null {
	const ran = rows.filter((r) => r.finishPosition !== null || !!r.passing);
	if (race.fieldSize === null || ran.length === 0 || ran.length !== race.fieldSize) return null;

	// 同じ位置の馬が同じ列に並ぶよう、位置を x、同じ位置の中の馬番の順を y にして隊列の1行を組む。
	const columns = (placed: { h: ActualFlowSource; at: number }[]) => {
		const sorted = [...placed].sort(
			(a, b) => a.at - b.at || (a.h.horseNumber ?? 99) - (b.h.horseNumber ?? 99)
		);
		return flowColumns(
			sorted.map(({ h, at }, i) => ({
				horseNumber: h.horseNumber,
				bracket: h.bracket,
				horseName: h.horseName,
				x: at,
				y: sorted.slice(0, i).filter((p) => p.at === at).length
			}))
		);
	};

	const at4 = corner4Positions(ran, race);
	const finished = ran.filter((r) => r.finishPosition !== null);
	const corner4 =
		finished.length > 0 && finished.every((r) => at4.has(r.entryId))
			? columns(ran.flatMap((h) => (at4.has(h.entryId) ? [{ h, at: at4.get(h.entryId)! }] : [])))
			: null;
	const finish =
		finished.length > 0 ? columns(finished.map((h) => ({ h, at: h.finishPosition! }))) : null;

	return corner4 || finish ? { corner4, finish } : null;
}
