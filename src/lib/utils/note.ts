/** メモの見出しと札の見せ方。タイムライン・ダッシュボード・予想画面で共通。 */

import type { NoteTag } from '$lib/schemas/note';

/**
 * 札の系統。色分けの根拠をここ1か所に置く。
 *
 * 色そのものは `TagPicker` / `TagBadges` が持つ（選択中とそうでないときで
 * クラスの形が違うので共有できない）。**どの札がどの系統か**だけを共有して、
 * 「読むときと書くときで色が違う」というずれを防ぐ。
 */
export type NoteTagGroup =
	/** 次走の結論。買い。 */
	| 'buy'
	/** 次走の結論。消し。 */
	| 'drop'
	/** 負けた理由（着順より走りを高く見る材料）。 */
	| 'excuse'
	/** 走りの中身が良かった材料。 */
	| 'merit';

/** `Record<NoteTag, ...>` にしてあるので、札を足すと型で漏れに気づく。 */
export const NOTE_TAG_GROUP: Record<NoteTag, NoteTagGroup> = {
	次走買い: 'buy',
	次走消し: 'drop',
	不利: 'excuse',
	馬場向かず: 'excuse',
	ペース合わず: 'excuse',
	馬場一致: 'merit',
	ハイレベル戦: 'merit',
	好ラップ: 'merit',
	好上がり: 'merit'
};

export type RaceLabelSource = {
	course?: string | null;
	raceNumber?: number | null;
	raceName?: string | null;
	grade?: string | null;
	/** 条件戦のクラス（`1勝クラス` 等）。格が無いレースはこれが識別子になる。 */
	className?: string | null;
};

export type NoteHeadingSource = RaceLabelSource & {
	kind: 'race' | 'horse' | 'entry' | 'preview';
	finishPosition?: number | null;
	horseName?: string | null;
};

/**
 * 行の種別を示す小さな札。**アプリが決めるもの**で、ユーザーは選べない
 * （ユーザーが付ける札は `NoteTag`）。表示は `KindBadge`。
 */
export type NoteKindLabel = '出走前' | '近況' | '出走' | '出走予定';

export type NoteHeading = {
	/** 「中山11R オールカマー (G2) 1着」のような見出し。 */
	label: string;
	/** 種別を示す小さな札。既定（レース後のメモ）は null。 */
	kindLabel: NoteKindLabel | null;
};

/** 「中山11R オールカマー (G2)」。格が無ければクラスを代わりに出す（design.md 第6章）。 */
function raceLabel(n: RaceLabelSource): string {
	const tier = n.grade ?? n.className;
	return [
		n.course ? `${n.course}${n.raceNumber ?? ''}R` : null,
		n.raceName,
		tier ? `(${tier})` : null
	]
		.filter(Boolean)
		.join(' ');
}

/**
 * 見出しと札を返す。
 *
 * **`preview`（出走前メモ）には着順を出さない。** 書いた時点では着順が無く、
 * あとから結果が入ると「出走前に書いたのに1着と書いてある」ように見えてしまう。
 * 代わりに「出走前」の札を付けて、同じレースのふりかえりメモと区別できるようにする。
 */
export function noteHeading(n: NoteHeadingSource): NoteHeading {
	if (n.kind === 'horse') {
		return { label: n.horseName ?? '', kindLabel: '近況' };
	}

	const race = raceLabel(n);

	if (n.kind === 'preview') {
		return { label: race || 'レース', kindLabel: '出走前' };
	}

	const withResult = [race, n.finishPosition ? `${n.finishPosition}着` : null]
		.filter(Boolean)
		.join(' ');

	return { label: withResult || 'レース', kindLabel: null };
}

export type RunHeadingSource = RaceLabelSource & { finishPosition?: number | null };

/**
 * **メモの無い出走**の見出し。タイムラインの骨になる行。
 *
 * `upcoming`（レース日がまだ来ていない）のときは着順を出さない。
 * 未来のレースに着順は無いし、`finish_position` は出馬表の投入で
 * あとから埋まる列なので、来ていれば「終わったレース」として着順を出す。
 */
export function runHeading(n: RunHeadingSource, upcoming: boolean): NoteHeading {
	const race = raceLabel(n);

	if (upcoming) return { label: race || 'レース', kindLabel: '出走予定' };

	const withResult = [race, n.finishPosition ? `${n.finishPosition}着` : null]
		.filter(Boolean)
		.join(' ');

	return { label: withResult || 'レース', kindLabel: '出走' };
}
