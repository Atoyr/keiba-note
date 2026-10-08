/**
 * レースの高低断面（スタートからゴールまでの上り下り）と、そのグラフの組み立て。
 * 元の数値は `course-elevation-data.ts`（JRA の高低断面図を読み取った概数）。
 */
import { ELEVATIONS } from './course-elevation-data.ts';

type Point = readonly [number, number];

export type ElevationProfile = {
	/** レースの距離（m）。 */
	distance: number;
	/** `[ゴールまでの距離（m）, ゴールとの高低差（m）]` を、ゴール（0）からスタート（distance）へ。 */
	points: Point[];
	/** 最後の直線の長さ（m）。直線コースは null（全部が直線）。 */
	straight: number | null;
	/** ゴールを右に描くか。スタンドから見た向きに合わせる（左回りと直線コースは左から右へ走ってくる）。 */
	goalRight: boolean;
	surface: '芝' | 'ダート';
};

/** 1周（直線コースは発走地点まで）の中の、ゴールまで s（m）の地点の高さ。 */
function heightAt(lap: readonly Point[], s: number): number {
	for (let i = 1; i < lap.length; i++) {
		const [d1, e1] = lap[i - 1];
		const [d2, e2] = lap[i];
		if (s === d2) return e2;
		if (s < d2) return e1 + ((e2 - e1) * (s - d1)) / (d2 - d1);
	}
	return lap[lap.length - 1][1];
}

/**
 * レースの高低断面。`file` はコース図のファイル名（`courseMap` の `file`）。
 * 数値の無いコース（内回り・外回りが決まらない）と、距離の分からないレースは null。
 *
 * 周回コースは、ゴールからコースを逆にたどって距離のぶんだけ拾う（1周を超えれば2周目に入る）。
 * ポケットから出るレースも、発走直後は周回コースの同じ距離の地点の高さで代える
 * （ポケットの高低は JRA も公表していない）。
 */
export function elevationProfile(
	file: string,
	distance: number | null,
	opts: Omit<ElevationProfile, 'distance' | 'points'>
): ElevationProfile | null {
	const lap = ELEVATIONS[file];
	if (!lap || !distance || distance <= 0) return null;
	const lapLength = lap[lap.length - 1][0];
	// 直線コースは1本道なので、発走地点より先はない。
	if (opts.straight === null && distance > lapLength) return null;

	const points: Point[] = [];
	for (let start = 0; start < distance; start += lapLength) {
		for (const [d, e] of lap) {
			// 周の継ぎ目（ゴール）は、前の周の終わりと同じ点。
			if (start > 0 && d === 0) continue;
			if (start + d >= distance) break;
			points.push([start + d, e]);
		}
	}
	points.push([distance, heightAt(lap, distance % lapLength || lapLength)]);
	return { distance, points, ...opts };
}

// ---------------------------------------------------------------------------
// グラフ。面と線は横 1000・縦 100 の SVG に描いて枠いっぱいに伸ばし、
// 目盛りの文字は HTML で割合の位置に置く（SVG の文字は伸ばすと潰れ、
// 伸ばさなければスマホで小さくなりすぎる）。
// ---------------------------------------------------------------------------

/**
 * 縦の目盛りの範囲（m）。**全場で同じにする。** レースごとに合わせると、
 * 高低差 0.7m の札幌も 5.3m の中山と同じ山に見えてしまう。
 * いちばん高いのは京都の外回り（+3.9m）、いちばん低いのは中山の芝（-2.6m）。
 */
const TOP = 4;
const BOTTOM = -3;
const LEVELS = [4, 2, 0, -2];

export type ElevationChart = {
	/** 面（下を閉じた形）と、上の線。 */
	area: string;
	line: string;
	/** 横の目盛り。x は左からの割合（%）。 */
	ticks: { x: number; label: string }[];
	/** 縦の目盛り。y は上からの割合（%）。 */
	levels: { y: number; label: string; zero: boolean }[];
	/** 最後の直線の範囲（%）。 */
	straight: { x1: number; x2: number } | null;
	/** 読み上げ用の要約。 */
	summary: string;
};

const W = 1000;
const H = 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const signed = (e: number) => (r1(e) > 0 ? `+${r1(e)}m` : `${r1(e)}m`);

/**
 * 横の目盛りの間隔。目盛りが6つを超えない、いちばん細かいもの。
 * スマホの幅（グラフが 300px ほど）でも「1000m」が隣と重ならない。
 */
function tickStep(distance: number): number {
	return [200, 400, 500, 1000].find((s) => distance / s <= 6) ?? 1000;
}

export function elevationChart(p: ElevationProfile): ElevationChart {
	const xOf = (s: number) => (p.goalRight ? 1 - s / p.distance : s / p.distance);
	const yOf = (e: number) => (TOP - Math.min(Math.max(e, BOTTOM), TOP)) / (TOP - BOTTOM);
	const pts = p.points.map(([s, e]) => `${r1(xOf(s) * W)} ${r1(yOf(e) * H)}`);
	const line = `M${pts.join('L')}`;
	const [firstS] = p.points[0];
	const [lastS] = p.points[p.points.length - 1];
	const area = `${line}L${r1(xOf(lastS) * W)} ${H}L${r1(xOf(firstS) * W)} ${H}Z`;

	const step = tickStep(p.distance);
	const ticks = [{ x: xOf(0) * 100, label: 'ゴール' }];
	for (let s = step; s < p.distance; s += step) {
		// 「スタート」の文字は数字より長いので、すぐ隣の目盛りは出さない（スマホの幅で重なる）。
		if (p.distance - s <= step) break;
		ticks.push({ x: xOf(s) * 100, label: `${s}m` });
	}
	ticks.push({ x: xOf(p.distance) * 100, label: 'スタート' });

	const levels = LEVELS.map((e) => ({ y: yOf(e) * 100, label: signed(e), zero: e === 0 }));
	const straight =
		p.straight === null
			? null
			: {
					x1: Math.min(xOf(0), xOf(Math.min(p.straight, p.distance))) * 100,
					x2: Math.max(xOf(0), xOf(Math.min(p.straight, p.distance))) * 100
				};

	const [, startE] = p.points[p.points.length - 1];
	const low = p.points.reduce((a, b) => (b[1] < a[1] ? b : a));
	const high = p.points.reduce((a, b) => (b[1] > a[1] ? b : a));
	const summary =
		`高低断面図（ゴールを 0m として）。スタート ${signed(startE)}、` +
		`いちばん高い所 ${signed(high[1])}（ゴールまで ${high[0]}m）、` +
		`いちばん低い所 ${signed(low[1])}（ゴールまで ${low[0]}m）`;

	return { area, line, ticks, levels, straight, summary };
}
