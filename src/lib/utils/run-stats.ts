/**
 * ふりかえり画面で、1頭の走りを読むための数字。
 *
 * 着順と上りのタイムだけでは「前で粘ったのか、後ろから届いたのか」「上りが速かったのか」が読めない。
 * どちらも結果（`race_entry`）にもう入っている通過順と上りから出せるので、ここで計算する。
 */

import { COURSE_SPECS, isStraightCourse } from './course';
import { FLOW_COLS, FLOW_LANES } from '../schemas/race-flow';
import {
	flowColumns,
	flowLeadsRight,
	type FlowCourse,
	type FlowHorse,
	type ResolvedSpot
} from './race-flow';

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

/** 実際の展開の1局面。盤面に置くコマと、隊列の1行。 */
export type ActualPhase = { spots: ResolvedSpot[]; columns: string[] };

/**
 * 実際の展開。4コーナーとゴール前の隊列を、予想と同じ盤面（`RaceFlowBoard`）と1行（`③-⑤⑦-⑪`）で返す。
 *
 * 予想で展開を置いていなくても、どう流れたかは結果から読める（4角は通過順、ゴール前は着順）。
 *
 * **盤面の置き方。** 結果には前後の順しか無い（内外が無い）。
 * - 前後: 順位の順に先頭のマスから置く。10マスに収まらない頭数（11頭以上）は、1マスに順位2つぶん（18頭なら2頭）をまとめる
 * - 上下: 同じマスに入った馬（同じ順位、またはまとめた2頭）を、順位 → 馬番の順に上の段から積む。**内外を表すものではない**
 * - 隊列の1行は盤面のマスではなく順位で区切る（まとめた2頭を同じ列に書くと、並んでいたように読める）。
 *   同じ順位（同じ通過順・同着）だけを1つの列にし、列の中は馬番の順
 *
 * **走った全頭がそろっているときだけ出す**（着順か通過順のある馬の数が `fieldSize` と同じとき）。
 * 気にしている馬だけ入れたレースで並べると、2頭だけの「隊列」が全体の流れのように読める。
 * 4角は、そのうえで完走した全馬が4角の位置を持つときだけ（直線のレースは出さない）。
 * どちらも出せなければ null。
 */
export function actualFlow(
	rows: readonly ActualFlowSource[],
	race: FlowCourse & { fieldSize: number | null }
): { leadsRight: boolean; corner4: ActualPhase | null; finish: ActualPhase | null } | null {
	const ran = rows.filter((r) => r.finishPosition !== null || !!r.passing);
	if (race.fieldSize === null || ran.length === 0 || ran.length !== race.fieldSize) return null;

	const phase = (placed: { h: ActualFlowSource; at: number }[]): ActualPhase => {
		const sorted = [...placed].sort(
			(a, b) => a.at - b.at || (a.h.horseNumber ?? 99) - (b.h.horseNumber ?? 99)
		);
		const horse = ({ h }: { h: ActualFlowSource }) => ({
			horseNumber: h.horseNumber,
			bracket: h.bracket,
			horseName: h.horseName
		});
		// 1マスにまとめる順位の数。18頭なら2（10マス × 2 で 20 位まで入る）。
		const per = Math.max(1, Math.ceil(Math.max(...sorted.map((p) => p.at)) / FLOW_COLS));
		const used = new Map<number, number>();
		const spots = sorted.map((p) => {
			// まとめたマスが段の数を超えて埋まっていたら（同じ順位が5頭など）、後ろのマスへ送る。
			let x = Math.min(FLOW_COLS - 1, Math.floor((p.at - 1) / per));
			while ((used.get(x) ?? 0) >= FLOW_LANES.length && x < FLOW_COLS - 1) x++;
			const y = used.get(x) ?? 0;
			used.set(x, y + 1);
			return { ...horse(p), x, y };
		});
		// 1行は順位で区切る（x に順位、y に同じ順位の中の並びを入れて列を組む）。
		const columns = flowColumns(
			sorted.map((p, i) => ({
				...horse(p),
				x: p.at,
				y: sorted.slice(0, i).filter((q) => q.at === p.at).length
			}))
		);
		return { spots, columns };
	};

	const at4 = corner4Positions(ran, race);
	const finished = ran.filter((r) => r.finishPosition !== null);
	const corner4 =
		finished.length > 0 && finished.every((r) => at4.has(r.entryId))
			? phase(ran.flatMap((h) => (at4.has(h.entryId) ? [{ h, at: at4.get(h.entryId)! }] : [])))
			: null;
	const finish =
		finished.length > 0 ? phase(finished.map((h) => ({ h, at: h.finishPosition! }))) : null;

	return corner4 || finish ? { leadsRight: flowLeadsRight(race), corner4, finish } : null;
}
