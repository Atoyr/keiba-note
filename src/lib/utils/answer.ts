/**
 * ふりかえり画面の「答え合わせ」。予想で付けた印と、走ったあとの着順を突き合わせる。
 *
 * ふりかえりを書く理由の中心は「自分の予想のどこが外れたか」を知ることにある。
 * 印は予想画面で付けて `preview` の行に入り、着順は `race_entry` に入るので、
 * 両方を持っているのはふりかえり画面だけ。ここで並べないと、どこでも並ばない。
 */

import { MARKS, type Mark } from '$lib/schemas/note';

/**
 * 1頭の答え。
 *
 * - `hit` — 当たり。◎○▲△ は3着以内、× は4着以下
 * - `miss` — 外れ。上の逆
 * - `pending` — 着順が入っていない（結果の投入待ち・取消）。当たりとも外れとも言えない
 *
 * 「3着以内」で切るのは、印の意味が「馬券に絡むか」だから。◎が2着でも
 * 本命としては仕事をしている。1着かどうかは着順そのものを見れば分かる。
 */
export type AnswerVerdict = 'hit' | 'miss' | 'pending';

/** 3着以内を「馬券に絡んだ」とみなす。 */
const PLACED = 3;

export function answerVerdict(mark: Mark, finishPosition: number | null): AnswerVerdict {
	if (finishPosition === null) return 'pending';
	const placed = finishPosition <= PLACED;
	// × は「来ない」と読んだ印なので、当たり外れが逆になる。
	return (mark === '×' ? !placed : placed) ? 'hit' : 'miss';
}

export type AnswerSource = {
	mark: Mark | null;
	finishPosition: number | null;
	horseNumber: number | null;
};

export type Answer<T extends AnswerSource> = T & { mark: Mark; verdict: AnswerVerdict };

/**
 * 印を付けた馬だけを、印の順（◎ → ×）に並べて答えを添える。
 *
 * 画面の出走馬は着順で並ぶので、そのまま印を拾うと「◎がどこにいるか」を探すことになる。
 * 答え合わせで先に知りたいのは本命がどうだったかなので、印の順に並べ直す。
 * 同じ印が複数あるとき（△を3頭など）は馬番の順。
 */
export function answerCheck<T extends AnswerSource>(rows: T[]): Answer<T>[] {
	return byMark(rows).map((r) => ({ ...r, verdict: answerVerdict(r.mark, r.finishPosition) }));
}

/**
 * 印を付けた馬だけを印の順（◎ → ×）に並べる。同じ印は馬番の順、馬番の無い馬は後ろ。
 *
 * 答え合わせと、予想画面の「付けた印」の一覧で同じ並びにする。
 * 予想で見た並びと結果で見る並びが違うと、同じ予想に見えない。
 */
export function byMark<T extends { mark: Mark | null; horseNumber: number | null }>(
	rows: T[]
): (T & { mark: Mark })[] {
	return rows
		.filter((r): r is T & { mark: Mark } => r.mark !== null)
		.sort(
			(a, b) =>
				MARKS.indexOf(a.mark) - MARKS.indexOf(b.mark) ||
				(a.horseNumber ?? Infinity) - (b.horseNumber ?? Infinity)
		);
}
