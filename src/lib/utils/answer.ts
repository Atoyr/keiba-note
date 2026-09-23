/**
 * ふりかえり画面の「答え合わせ」。予想で付けた印と、走ったあとの着順を突き合わせる。
 *
 * ふりかえりを書く理由の中心は「自分の予想のどこが外れたか」を知ることにある。
 * 印は予想画面で付けて `preview` の行に入り、着順は `race_entry` に入るので、
 * 両方を持っているのはふりかえり画面だけ。ここで並べないと、どこでも並ばない。
 */

import { MARKS, type Mark } from '$lib/schemas/note';

/**
 * 1頭の結果を競馬の言い方で。
 *
 * - `in` — **馬券内**（3着以内）
 * - `out` — **着外**（4着以下）
 * - `pending` — **未確定**。着順が入っていない（結果の投入待ち・取消）
 *
 * 「当たり／外れ」とは言わない。競馬で「的中」は買った馬券に使う言葉で、
 * このアプリは馬券を記録していない。印に的中と付けると馬券が当たったように読める。
 * 出すのは事実（馬券内か着外か）だけにして、印と並べて読ませる。
 */
export type Placing = 'in' | 'out' | 'pending';

/** 3着以内を馬券内とみなす（複勝圏）。 */
const IN_THE_MONEY = 3;

export function placing(finishPosition: number | null): Placing {
	if (finishPosition === null) return 'pending';
	return finishPosition <= IN_THE_MONEY ? 'in' : 'out';
}

/**
 * 印のとおりに走ったか。色の強弱にだけ使う。
 *
 * ◎○▲△ は「馬券に絡む」と読んだ印なので馬券内なら読みどおり、
 * × は「来ない」と読んだ印なので着外なら読みどおり。未確定なら null。
 * 言葉は馬券内／着外のままで、× が馬券内に来たとき（消した馬に来られた）だけ目立たせる。
 */
export function asMarked(mark: Mark, p: Placing): boolean | null {
	if (p === 'pending') return null;
	return mark === '×' ? p === 'out' : p === 'in';
}

export type AnswerSource = {
	mark: Mark | null;
	finishPosition: number | null;
	horseNumber: number | null;
};

export type Answer<T extends AnswerSource> = T & {
	mark: Mark;
	placing: Placing;
	asMarked: boolean | null;
};

/**
 * 印を付けた馬だけを、印の順（◎ → ×）に並べて結果を添える。
 *
 * 画面の出走馬は着順で並ぶので、そのまま印を拾うと「◎がどこにいるか」を探すことになる。
 * 答え合わせで先に知りたいのは本命がどうだったかなので、印の順に並べ直す。
 * 同じ印が複数あるとき（△を3頭など）は馬番の順。
 */
export function answerCheck<T extends AnswerSource>(rows: T[]): Answer<T>[] {
	return rows
		.filter((r): r is T & { mark: Mark } => r.mark !== null)
		.map((r) => {
			const p = placing(r.finishPosition);
			return { ...r, placing: p, asMarked: asMarked(r.mark, p) };
		})
		.sort(
			(a, b) =>
				MARKS.indexOf(a.mark) - MARKS.indexOf(b.mark) ||
				(a.horseNumber ?? Infinity) - (b.horseNumber ?? Infinity)
		);
}

/**
 * 見出しの集計。「◎○▲△ 3頭中 2頭 馬券内」。
 *
 * 数えるのは**着順が決まった、× 以外の印**だけ。× は「来ない」と読んだ印なので
 * 馬券内の数に混ぜると意味が逆になる。未確定の馬は分母に入れない。
 * 数える馬がいなければ null（見出しに何も添えない）。
 */
export function inTheMoneyCount(
	answers: Answer<AnswerSource>[]
): { in: number; of: number } | null {
	const decided = answers.filter((a) => a.mark !== '×' && a.placing !== 'pending');
	if (decided.length === 0) return null;
	return { in: decided.filter((a) => a.placing === 'in').length, of: decided.length };
}
