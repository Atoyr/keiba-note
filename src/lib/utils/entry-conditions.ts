/**
 * 予想画面の出走馬ごとに出す、今回の条件（騎手・斤量・ブリンカー）と前走からの変化の組み立て。純粋関数。
 *
 * 原則: **情報がないことを「変更なし」「着用なし」と扱わない。** 比べる相手（前走）が無い・値が欠けている項目は、
 * 同じとも違うとも言わず、今回の値だけを出す。語で区別し、色だけに頼らない。
 */

/** 前走を探す・比べるのに使う、過去走1走ぶんの項目。`PastRun`（馬柱）の一部。 */
export type RunForConditions = {
	finishPosition: number | null;
	fieldSize: number | null;
	winnerName: string | null;
	runnerUpName: string | null;
	jockey: string | null;
	weightCarried: number | null;
	blinker: boolean | null;
};

export type CurrentConditions = {
	jockey: string | null;
	/** 出馬表の公開後に騎手が変わったときの、発表時の騎手。 */
	announcedJockey: string | null;
	weightCarried: number | null;
	blinker: boolean | null;
};

/** 1項目。`lead` は先頭の語（変化の語は強めに出す）、`rest` はそのあとの文字。 */
export type ConditionItem = { lead: string; rest: string; strong: boolean };

/** 騎手名が同じか。略称（片方がもう片方の頭と一致）も同じとみなす。取り込み側（apply.ts）と同じ比べ方。 */
export function sameJockey(a: string, b: string): boolean {
	return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * 前走。**取り込まれている過去走（新しい順）のうち、今回より前に実際に出走した最新のレース。**
 *
 * - 着順がある → 前走
 * - 着順が無く、レースに結果が入っている（頭数・勝ち馬・2着馬のどれか）→ 取消・除外（・中止）として飛ばす
 * - 着順が無く、レースに結果も無い → 走ったか分からないので前走なし（比べない）。古い走へは下りない
 */
export function previousRun<T extends RunForConditions>(runs: readonly T[]): T | null {
	for (const run of runs) {
		if (run.finishPosition !== null) return run;
		const settled = run.fieldSize !== null || run.winnerName !== null || run.runnerUpName !== null;
		if (!settled) return null;
	}
	return null;
}

/** 57 → `57kg`、57.5 → `57.5kg`。 */
const kg = (n: number) => `${n}kg`;

/** 前走との差。`+1kg`・`-1kg`・`+0.5kg`。0.1 単位に丸める（浮動小数の端数を出さない）。 */
function diffLabel(diff: number): string {
	return `${diff > 0 ? '+' : ''}${kg(diff)}`;
}

export function entryConditions(
	current: CurrentConditions,
	runs: readonly RunForConditions[]
): ConditionItem[] {
	const prev = previousRun(runs);
	const items: ConditionItem[] = [];

	// 乗り替わり: 前走と今回の騎手が両方分かり、違うときだけ。
	if (current.jockey && prev?.jockey && !sameJockey(prev.jockey, current.jockey)) {
		items.push({ lead: '乗り替わり', rest: `（前走 ${prev.jockey}）`, strong: true });
	}
	// 騎手変更: 出馬表の公開後に変わったときだけ。前走からの乗り替わりとは別に出す。
	if (
		current.jockey &&
		current.announcedJockey &&
		!sameJockey(current.announcedJockey, current.jockey)
	) {
		items.push({ lead: '騎手変更', rest: `（発表時 ${current.announcedJockey}）`, strong: true });
	}

	// 斤量
	if (current.weightCarried === null) {
		items.push({ lead: '斤量', rest: ' 未取得', strong: false });
	} else {
		const base = ` ${kg(current.weightCarried)}`;
		if (prev?.weightCarried == null) {
			items.push({ lead: '斤量', rest: base, strong: false });
		} else {
			const diff = Math.round((current.weightCarried - prev.weightCarried) * 10) / 10;
			items.push({
				lead: '斤量',
				rest: `${base}（${diff === 0 ? '前走と同じ' : `前走比 ${diffLabel(diff)}`}）`,
				strong: false
			});
		}
	}

	// ブリンカー: 前走が分かるときだけ、着用開始・外すを言う。
	const prevBlinker = prev?.blinker ?? null;
	let blinker: string;
	if (current.blinker === null) blinker = ' 未取得';
	else if (current.blinker) blinker = prevBlinker === false ? ' 着用開始' : ' 着用';
	else blinker = prevBlinker === true ? ' 外す（前走は着用）' : ' なし';
	items.push({ lead: 'ブリンカー', rest: blinker, strong: false });

	return items;
}
