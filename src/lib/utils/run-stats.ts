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

/**
 * 着差の表記（`クビ`・`1.1/4`・`2`）を馬身にする。読めない表記・空は null。
 *
 * `ハナ` 0.1・`アタマ` 0.2・`クビ` 0.3（実際の差をおおよそ馬身にした値。順序が保てれば足りる）、
 * `同着` 0、`大`・`大差` は 10 馬身とみなす（実際はそれ以上。盤面ではいちばん後ろに離れて見えれば足りる）。
 * 数字は `2`・`1/2`・`1.1/4`。**`1.1/4` の `.` は小数点ではなく整数と分数の区切り**（1 と 1/4 で 1.25 馬身）。
 */
export function marginLengths(margin: string | null): number | null {
	const text = margin?.trim();
	if (!text) return null;
	const words: Record<string, number> = {
		ハナ: 0.1,
		アタマ: 0.2,
		クビ: 0.3,
		同着: 0,
		大: 10,
		大差: 10
	};
	if (text in words) return words[text];
	const m = /^(?:(\d+)\.)?(\d+)(?:\/(\d+))?$/.exec(text);
	if (!m) return null;
	const [, whole, a, b] = m;
	if (b === undefined) {
		// `1.5` のように分数を伴わない小数は、着差の表記ではないので読まない。
		return whole === undefined ? Number(a) : null;
	}
	if (Number(b) === 0) return null;
	return Number(whole ?? 0) + Number(a) / Number(b);
}

type ActualFlowSource = FlowHorse & {
	entryId: string;
	finishPosition: number | null;
	passing: string | null;
	/** 着差の表記（`クビ`）。ゴール前を着差で置くときに読む。 */
	margin: string | null;
};

/**
 * 実際の展開の1局面。盤面に置くコマ（`at` は順位。4角の位置か着順）と、隊列の1行。
 * `cell` は着差で置いたときの盤面の1マスの馬身。順位で置いたとき（4角・着差の読めないゴール前）は null。
 */
export type ActualPhase = {
	spots: (ResolvedSpot & { at: number })[];
	columns: string[];
	cell: number | null;
};

/**
 * 盤面のマスに馬を置く。`wants[i]` が i 番目の馬の行きたいマスで、**馬は着順・順位の順（`wants` の昇順）に来る前提**。
 * 前後の順を崩さない（着順の良い馬が、悪い馬より後ろに描かれない）。
 *
 * 1. 前から: 段（`FLOW_LANES`）が埋まっていたら後ろのマスへ送る。最後のマスで止めず、仮の x は盤面の外に出てよい
 * 2. 後ろから: いちばん後ろの馬から、x = min(仮の x, 1つ後ろの馬の x, 最後のマス) とし、そのマスが埋まっていたら前へ寄せる。
 *    最後のマスで溢れたときは、最後方の馬が最後のマスを取り、**先着した馬のほうが**前のマスへ押し出される
 * 3. 同じマスの馬を元の順（先着が上）で上の段から積む。y は段の数未満
 */
function stackOnBoard(wants: readonly number[]): { x: number; y: number }[] {
	const lanes = FLOW_LANES.length;
	const forward = new Map<number, number>();
	const tentative = wants.map((want) => {
		let x = Math.max(0, want);
		while ((forward.get(x) ?? 0) >= lanes) x++;
		forward.set(x, (forward.get(x) ?? 0) + 1);
		return x;
	});

	const xs = new Array<number>(wants.length);
	const backward = new Array<number>(FLOW_COLS).fill(0);
	for (let i = wants.length - 1; i >= 0; i--) {
		let x = Math.min(tentative[i], i + 1 < wants.length ? xs[i + 1] : FLOW_COLS - 1, FLOW_COLS - 1);
		while (x > 0 && backward[x] >= lanes) x--;
		backward[x]++;
		xs[i] = x;
	}

	const stacked = new Array<number>(FLOW_COLS).fill(0);
	return xs.map((x) => {
		const y = Math.min(stacked[x], lanes - 1);
		stacked[x]++;
		return { x, y };
	});
}

/**
 * 実際の展開。4コーナーとゴール前の隊列を、予想と同じ盤面（`RaceFlowBoard`）と1行（`③-⑤⑦-⑪`）で返す。
 *
 * 予想で展開を置いていなくても、どう流れたかは結果から読める（4角は通過順、ゴール前は着差か着順）。
 *
 * **盤面の置き方。** 結果には前後の順しか無い（内外が無い）。
 * - 前後（順位で置く。4角と、着差の読めないゴール前）: **同じ順位の馬を1つのマス（列）に、違う順位は違う列に**置く。
 *   通過順の同じ数字は「並んでいる」を表すので、順位の数字を割ってマスに入れると、
 *   1番手と2番手が同じマスに並んだり、3番手と4番手の間の空き番が混ざったりする。
 *   出てくる順位（重複を除く）を小さい順に並べ、その何番目かを列の番号にする。
 *   同じ順位が段の数（4）を超えるときは、そのまとまりが `ceil(頭数 / 4)` 列を取り、次の順位はその後ろの列から始める
 *   （溢れた馬が次の順位の列に混ざって、並んでいたように見えないように）。
 *   列の幅の合計が10マスを超えるとき（全頭の順位がばらばらの11頭以上など）は、隣の列を `ceil(列の数 / 10)` 個ずつまとめる
 * - 前後（着差で置く。ゴール前）: **着順の全馬に着差が読めるときは、勝ち馬からの累積の着差（馬身）で置く。**
 *   順位で置くと 1-2着・3-4着… が機械的に2頭ずつ並び、ハナ差の2頭と2馬身離れた2頭が同じ見た目になる。
 *   1マスの馬身は最後の馬が最後のマスに来るよう決め（下限 0.5 馬身。少頭数の接戦で広がりすぎないように）、`cell` で返す
 * - 上下: 同じマスに入った馬を、順位 → 馬番の順に上の段から積む。**内外を表すものではない**。
 *   4段が埋まったら後ろのマスへ送る。最後のマスで溢れたら、最後方の馬が最後のマスを取り、先着した馬が前のマスへ寄る
 *   （前後の順は崩さない。送られた馬が隣の列に混ざるのは許す）
 * - 隊列の1行は盤面のマスではなく順位で区切る（まとめた馬を同じ列に書くと、並んでいたように読める）。
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

	type Placed = { h: ActualFlowSource; at: number };
	const horse = ({ h }: Placed) => ({
		horseNumber: h.horseNumber,
		bracket: h.bracket,
		horseName: h.horseName
	});
	const bySpot = (a: Placed, b: Placed) =>
		a.at - b.at || (a.h.horseNumber ?? 99) - (b.h.horseNumber ?? 99);

	/**
	 * 順位で置く。同じ順位の馬は1つのまとまりで、**段の数を超える頭数なら2列以上の幅**を取る
	 * （`ceil(頭数 / 段の数)`。溢れた馬がそのまとまりの2列目に入り、次の順位の列に混ざらない）。
	 * 幅の合計が盤面に収まるときは、まとまりの先頭の列 = それより前のまとまりの幅の合計。
	 * 収まらないとき（全頭ばらばらの11頭以上など）は、隣の列を `ceil(列の数 / 10)` 個ずつまとめる。
	 */
	const rankedWants = (sorted: Placed[]) => {
		const ranks = [...new Set(sorted.map((p) => p.at))];
		const widths = ranks.map((r) =>
			Math.ceil(sorted.filter((p) => p.at === r).length / FLOW_LANES.length)
		);
		if (widths.reduce((a, b) => a + b, 0) <= FLOW_COLS) {
			const starts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
			return sorted.map((p) => starts[ranks.indexOf(p.at)]);
		}
		const per = Math.max(1, Math.ceil(ranks.length / FLOW_COLS));
		return sorted.map((p) => Math.floor(ranks.indexOf(p.at) / per));
	};

	/** 着差で置く。2頭目以降の着差が1頭でも読めなければ null（順位で置く）。 */
	const marginWants = (sorted: Placed[]) => {
		let total = 0;
		const totals = sorted.map((p, i) => {
			if (i === 0) return 0;
			const len = marginLengths(p.h.margin);
			if (len === null) return null;
			return (total += len);
		});
		if (totals.some((t) => t === null)) return null;
		const cell = Math.max(0.5, total / (FLOW_COLS - 1));
		return {
			cell,
			wants: totals.map((t) => Math.min(FLOW_COLS - 1, Math.floor((t as number) / cell + 1e-9)))
		};
	};

	const phase = (placed: Placed[], byMargin: boolean): ActualPhase => {
		const sorted = [...placed].sort(bySpot);
		const margin = byMargin ? marginWants(sorted) : null;
		const wants = margin?.wants ?? rankedWants(sorted);
		const cells = stackOnBoard(wants);
		const spots = sorted.map((p, i) => ({ ...horse(p), ...cells[i], at: p.at }));
		// 1行は順位で区切る（x に順位、y に同じ順位の中の並びを入れて列を組む）。
		const columns = flowColumns(
			sorted.map((p, i) => ({
				...horse(p),
				x: p.at,
				y: sorted.slice(0, i).filter((q) => q.at === p.at).length
			}))
		);
		return { spots, columns, cell: margin?.cell ?? null };
	};

	const at4 = corner4Positions(ran, race);
	const finished = ran.filter((r) => r.finishPosition !== null);
	const corner4 =
		finished.length > 0 && finished.every((r) => at4.has(r.entryId))
			? phase(
					ran.flatMap((h) => (at4.has(h.entryId) ? [{ h, at: at4.get(h.entryId)! }] : [])),
					false
				)
			: null;
	const finish =
		finished.length > 0
			? phase(
					finished.map((h) => ({ h, at: h.finishPosition! })),
					true
				)
			: null;

	return corner4 || finish ? { leadsRight: flowLeadsRight(race), corner4, finish } : null;
}
