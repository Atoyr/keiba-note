/**
 * 予想画面の出走馬ごとに出す、今回の条件（騎手・斤量）と前走からの変化の組み立て。純粋関数。
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
};

export type CurrentConditions = {
	jockey: string | null;
	/** 出馬表の公開後に騎手が変わったときの、発表時の騎手。 */
	announcedJockey: string | null;
	weightCarried: number | null;
};

/** 1項目。`lead` は先頭の語（変化の語は強めに出す）、`rest` はそのあとの文字。 */
export type ConditionItem = { lead: string; rest: string; strong: boolean };

/** 比べる前の下ごしらえ。全角半角をそろえ、「.」と空白を落とす（`C.ルメール` / `Ｃ．ルメール` / `Cルメール`）。 */
const normalizeJockey = (s: string) => s.normalize('NFKC').replace(/[.\s]/g, '');

/**
 * 騎手名が同じか。表記ゆれ（全角半角・「.」・空白）をそろえたうえで、同じか前方一致（略称）なら同じ。
 * 片方にだけ頭文字（頭の英大文字1字）があるときは、それを落とした形で比べる（`C.ルメール` と `ルメール`）。
 * **両方に頭文字があって違えば別の騎手**（`C.デムーロ` と `M.デムーロ`）。
 * 取り込み側（scripts/race-data/apply.ts）もこの関数を使う。
 */
export function sameJockey(a: string, b: string): boolean {
	const x = normalizeJockey(a);
	const y = normalizeJockey(b);
	if (x === '' || y === '') return false;
	const initial = (s: string) => /^[A-Z](?=.)/.exec(s)?.[0];
	const [ix, iy] = [initial(x), initial(y)];
	if (ix && iy && ix !== iy) return false;
	// 片方にだけ頭文字があれば落としてそろえる（両方にあって同じなら、そのままで比べられる）。
	const [p, q] = ix && !iy ? [x.slice(1), y] : iy && !ix ? [x, y.slice(1)] : [x, y];
	return p.startsWith(q) || q.startsWith(p);
}

/**
 * 前走。**取り込まれている過去走（新しい順）の先頭が、着順のある走ならそれ。** 着順が無ければ null（比べない）。
 *
 * 着順が無い走は、取消・除外（走っていない）か中止・失格（走った）か、データからは区別できない。
 * 飛ばして古い走と比べると、走った中止の走を無視してしまうことがあるので、断定せず前走なしにする。
 */
export function previousRun<T extends RunForConditions>(runs: readonly T[]): T | null {
	const latest = runs[0];
	return latest && latest.finishPosition !== null ? latest : null;
}

/** 57 → `57kg`、57.5 → `57.5kg`。 */
const kg = (n: number) => `${n}kg`;

/** 前走との差の表記。`+1kg`・`-1kg`・`+0.5kg`。浮動小数の端数は呼ぶ側で 0.1 単位に丸めてから渡す。 */
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
				strong: diff !== 0
			});
		}
	}

	// ブリンカーは項目に出さない。着用は馬名の隣の `BlinkerBadge`（B）に出し、外したかどうかは前走（馬柱）で読む。

	return items;
}
