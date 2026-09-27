/**
 * ラップ（区間タイム）から、ふりかえりで読む数字と折れ線を組む。
 *
 * ラップは `race.laps` に、スタートから 200m ごとの区間タイム（秒）で入っている。
 * 距離が 200m で割り切れないレース（2500m など）は、最初の区間が端数（100m）。
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: readonly number[]) => r1(xs.reduce((a, b) => a + b, 0));

/** 最初の区間の長さ（m）。200m で割り切れる距離なら 200、2500m なら 100。 */
export function firstLapLength(lapCount: number, distance: number | null): number {
	if (distance === null) return 200;
	const rest = distance - 200 * (lapCount - 1);
	return rest > 0 && rest <= 200 ? rest : 200;
}

export type LapSummary = {
	/** 前半3F（秒）。最初の3つの 200m の区間の合計。 */
	front: number;
	/** 後半3F（秒）。最後の3つの区間の合計。 */
	back: number;
	/** 前半3F − 後半3F。正なら後半のほうが速い（後傾）、負なら前半のほうが速い（前傾）。 */
	diff: number;
	/** 前半3Fに数えた区間の位置（`laps` の添字）。 */
	frontIndex: [number, number];
	/** 後半3Fに数えた区間の位置。 */
	backIndex: [number, number];
};

/**
 * 前半3F・後半3F。
 *
 * **最初の区間が端数（100m）のときは、それを飛ばした3区間を前半3Fにする。** 端数の区間は
 * 200m ぶん走っていないので、足すと 600m にならない（500m ぶんの「3F」になる）。
 * 区間が3つに満たなければ出せない（null）。
 */
export function lapSummary(laps: readonly number[], distance: number | null): LapSummary | null {
	const start = firstLapLength(laps.length, distance) < 200 ? 1 : 0;
	if (laps.length - start < 3) return null;
	const front = sum(laps.slice(start, start + 3));
	const back = sum(laps.slice(-3));
	return {
		front,
		back,
		diff: r1(front - back),
		frontIndex: [start, start + 2],
		backIndex: [laps.length - 3, laps.length - 1]
	};
}

/** 前後半の差の言い方。「後半が1.2秒速い」「前後半が同じ」。 */
export function lapDiffLabel(diff: number): string {
	if (diff === 0) return '前後半が同じ';
	return diff > 0 ? `後半が${diff.toFixed(1)}秒速い` : `前半が${(-diff).toFixed(1)}秒速い`;
}

export type LapChart = {
	/** SVG の path（viewBox 0 0 1000 100、速いほど上）。 */
	line: string;
	/** 各区間の点の位置（%）。x は区間の真ん中。 */
	points: { x: number; y: number; lap: number }[];
	/** 目盛り（いちばん速い区間といちばん遅い区間）。y は %。 */
	levels: { y: number; label: string }[];
	/** 前半3F・後半3Fに塗る範囲（%）。 */
	front: { x1: number; x2: number } | null;
	back: { x1: number; x2: number } | null;
	/** 読み上げ用の説明。 */
	summary: string;
};

/**
 * ラップの折れ線。**速い区間ほど上に描く**（ペースが上がったところが山に見える）。
 *
 * 縦の目盛りは 0 秒から取らない。区間タイムの差は 1〜2 秒なので、0 からだと線が平らになって読めない。
 * いちばん速い区間といちばん遅い区間の上下に 0.2 秒ずつ余白を取る。
 *
 * **最初の区間が端数（100m）のレースは、その区間を描かない。** 100m ぶんのタイム（7秒ほど）は 200m の区間と
 * 比べられず、目盛りの端に来てほかの区間が下に押し込まれる。描くのは 200m の区間だけで、端数の区間は
 * 折れ線の下の区間タイムの1行にだけ出る。
 */
export function lapChart(laps: readonly number[], distance: number | null): LapChart {
	const start = firstLapLength(laps.length, distance) < 200 ? 1 : 0;
	const drawn = laps.slice(start);
	const fast = Math.min(...drawn);
	const slow = Math.max(...drawn);
	const top = fast - 0.2;
	const bottom = slow + 0.2;
	const yOf = (t: number) => ((t - top) / (bottom - top)) * 100;
	const xOf = (i: number) => ((i + 0.5) / drawn.length) * 100;
	const points = drawn.map((lap, i) => ({ x: xOf(i), y: yOf(lap), lap }));
	const line = `M${points.map((p) => `${r1(p.x * 10)} ${r1(p.y)}`).join('L')}`;

	const s = lapSummary(laps, distance);
	// 前後半3Fの位置は laps の添字なので、描かなかった端数の区間ぶんずらす。
	const band = (i: [number, number]) => ({
		x1: ((i[0] - start) / drawn.length) * 100,
		x2: ((i[1] - start + 1) / drawn.length) * 100
	});
	const levels = [
		{ y: yOf(fast), label: fast.toFixed(1) },
		...(slow === fast ? [] : [{ y: yOf(slow), label: slow.toFixed(1) }])
	];
	const summary =
		`ラップの折れ線（速い区間ほど上）。${laps.map((l) => l.toFixed(1)).join('、')}。` +
		(s
			? `前半3F ${s.front.toFixed(1)}、後半3F ${s.back.toFixed(1)}（${lapDiffLabel(s.diff)}）`
			: '');

	return {
		line,
		points,
		levels,
		front: s ? band(s.frontIndex) : null,
		back: s ? band(s.backIndex) : null,
		summary
	};
}
