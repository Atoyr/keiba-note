import {
	FLOW_PHASES,
	FLOW_PHASE_SHORT,
	type FlowPhase,
	type Pace,
	type RaceFlow
} from '../schemas/race-flow';
import { COURSE_SPECS, isStraightCourse } from './course';

/** 盤面に置く馬の見た目に要るもの。 */
export type FlowHorse = { horseNumber: number | null; bracket: number | null; horseName: string };

export type ResolvedSpot = FlowHorse & { x: number; y: number };

/**
 * 表示用の展開。出走馬の id を馬番・枠・馬名に引き当てたもの。
 *
 * 予想まとめの共有は**コピーを保存する**ので、id のままだと共有ページから馬が引けない。
 * 共有に載せるのはこの形（アカウントや出走馬の id を含めない）。
 */
export type ResolvedFlow = {
	pace: Pace | null;
	/** 先頭を右に描くか（左回り）。→ `flowLeadsRight` */
	leadsRight: boolean;
} & Record<FlowPhase, { spots: ResolvedSpot[]; memo: string }>;

/** 回りを決めるのに要るレースの項目。 */
export type FlowCourse = {
	course: string;
	direction: string | null;
	surface: string | null;
	distance: number | null;
};

/**
 * 盤面で先頭をどちらに描くか。**スタンドから見た向きに合わせる。**
 *
 * 右回りは直線を右から左へ、左回りは左から右へ走ってくる（中継の画面もこの向き）。
 * 盤面の上は内ラチなので、スタンド側から見下ろした形になる。
 * 回りはレースの `direction` を先に見て、空なら場の回り（`COURSE_SPECS`。コース図と同じ出どころ）で決める。
 * 直線コースと、どちらでも決まらないレースは右回りと同じ向き（先頭が左）にする。
 */
export function flowLeadsRight(race: FlowCourse): boolean {
	const spec = COURSE_SPECS[race.course];
	// 直線コースは回りが空でも距離で決まる（コース図と同じ判定）。
	if (race.direction === '直線' || (spec && isStraightCourse(spec, race))) return false;
	if (race.direction === '左') return true;
	if (race.direction) return false;
	return spec?.direction === '左';
}

export function resolveFlow(
	flow: RaceFlow,
	horses: ReadonlyMap<string, FlowHorse>,
	race: FlowCourse
): ResolvedFlow {
	const phase = (p: FlowPhase) => ({
		memo: flow[p].memo,
		spots: flow[p].spots.flatMap((s) => {
			const h = horses.get(s.entryId);
			// **項目を選んで写す。** 渡される行には出走馬や馬の id も乗っていることがあり、
			// 丸ごと広げると共有のコピーにまで入る。
			return h
				? [
						{
							horseNumber: h.horseNumber,
							bracket: h.bracket,
							horseName: h.horseName,
							x: s.x,
							y: s.y
						}
					]
				: [];
		})
	});
	return {
		pace: flow.pace,
		leadsRight: flowLeadsRight(race),
		start: phase('start'),
		corner4: phase('corner4'),
		finish: phase('finish')
	};
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

const hasCircled = (h: Pick<FlowHorse, 'horseNumber'>) =>
	!!h.horseNumber && h.horseNumber >= 1 && h.horseNumber <= CIRCLED.length;

/** 盤面のコマと1行の要約で使う、馬の短い呼び名。馬番が無いうちは馬名の頭2文字。 */
export const horseToken = (h: Pick<FlowHorse, 'horseNumber' | 'horseName'>) =>
	hasCircled(h) ? CIRCLED[h.horseNumber! - 1] : [...h.horseName].slice(0, 2).join('');

/**
 * 隊列を前から後ろへ列ごとに区切る（`['⑤', '③⑦', '⑪①']`）。同じ列に並んだ馬は内から続けて書く。
 *
 * **馬番が無いうち（頭2文字）は、同じ列の中も `･`（半角の中黒。全角だと18頭で行が増える）で区切る。** 丸数字は1字で1頭と読めるが、
 * 「アカイナ」は どこで馬が切れるか読めない。
 */
export function flowColumns(spots: readonly ResolvedSpot[]): string[] {
	const cols = new Map<number, ResolvedSpot[]>();
	for (const s of spots) cols.set(s.x, [...(cols.get(s.x) ?? []), s]);
	return [...cols.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, col]) => {
			const sorted = [...col].sort((a, b) => a.y - b.y);
			return sorted.map(horseToken).join(sorted.every((h) => hasCircled(h)) ? '' : '･');
		});
}

/** 隊列の1行（`⑤-③⑦-⑪①`）。新聞の隊列の書き方に寄せ、列の切れ目を `-` で表す。 */
export const flowOrder = (spots: readonly ResolvedSpot[]): string => flowColumns(spots).join('-');

/** 閉じているときに出す、局面ごとの隊列の1行。隊列を置いていない局面は出さない。 */
export function flowDigest(
	flow: ResolvedFlow
): { phase: FlowPhase; label: string; columns: string[] }[] {
	return FLOW_PHASES.filter((p) => flow[p].spots.length > 0).map((p) => ({
		phase: p,
		label: FLOW_PHASE_SHORT[p],
		columns: flowColumns(flow[p].spots)
	}));
}

export const hasResolvedFlow = (flow: ResolvedFlow | null | undefined): flow is ResolvedFlow =>
	!!flow &&
	(flow.pace !== null ||
		FLOW_PHASES.some((p) => flow[p].spots.length > 0 || flow[p].memo.trim() !== ''));
