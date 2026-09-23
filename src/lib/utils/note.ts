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
	kind: 'race' | 'horse' | 'entry' | 'preview' | 'race_preview';
	finishPosition?: number | null;
	horseName?: string | null;
};

/**
 * 行の種別を示す小さな札。**アプリが決めるもの**で、ユーザーは選べない
 * （ユーザーが付ける札は `NoteTag`）。表示は `KindBadge`。
 */
export type NoteKindLabel = '見立て' | '出走前' | '近況' | '出走' | '出走予定';

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
 * **開催前に書いたメモには着順を出さない。** 書いた時点では着順が無く、
 * あとから結果が入ると「出走前に書いたのに1着と書いてある」ように見えてしまう。
 * 代わりに札を付けて、同じレースのふりかえりメモと区別できるようにする。
 * 札が2種類あるのは、対象がレースか1頭かで読み方が違うため
 * （`race_preview` はレース全体の見立て、`preview` は1頭の見立て）。
 */
export function noteHeading(n: NoteHeadingSource): NoteHeading {
	if (n.kind === 'horse') {
		return { label: n.horseName ?? '', kindLabel: '近況' };
	}

	const race = raceLabel(n);

	if (n.kind === 'race_preview') {
		return { label: race || 'レース', kindLabel: '見立て' };
	}

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

/**
 * ふりかえり画面（`/races/[id]`）の保存ボタンの文言。
 *
 * 出走馬がまだ登録されていないレース（結果の投入がまだのレースなど）では、
 * 入力欄は「レースのメモ」1つだけになる。それを「まとめて保存」と呼ぶと、
 * 画面に出ていない何かも一緒に保存されるように読めてしまう。
 * 1つしか無いときは、何を保存するのかをそのまま名乗る。
 */
export function raceReviewSaveLabel(entryCount: number): string {
	return entryCount > 0 ? 'まとめて保存' : 'レースのメモを保存';
}

/**
 * 予想画面（`/races/[id]/preview`）の保存ボタンの文言。
 *
 * 理由は `raceReviewSaveLabel` と同じ。**こちらのほうが出走馬0頭に当たりやすい**：
 * これから組まれる重賞は日付と格だけ先に登録され、出馬表はその後に入る。
 * その段階で書けるのは見立て1本だけなので、そう名乗る。
 */
export function previewSaveLabel(entryCount: number): string {
	return entryCount > 0 ? '出走前メモを保存' : 'レースの見立てを保存';
}

export type ConclusionSource = {
	kind: NoteHeadingSource['kind'];
	tags: NoteTag[];
	occurredAt: string;
};

/**
 * 予想画面の行の見出しに出す、**その馬について自分が最後に下した結論**。
 *
 * 過去メモは行の中に並ぶが、16頭を見比べるときに本文までは読めない。
 * 「前走で次走買い・不利と書いた」が見出しに出ていれば、それだけで拾える。
 *
 * 拾うのは**走ったあとに書いたメモ**（ふりかえり `entry` と近況 `horse`）で、札が付いたもの。
 * 出走前メモの札は「そのレースでどう見ていたか」で、結果を見たあとの結論ではない。
 * `history` は新しいメモが先に並んでいる前提（`listHistoryForHorses` の並び）。
 */
export function latestConclusion<T extends ConclusionSource>(history: T[]): T | null {
	return (
		history.find((n) => (n.kind === 'entry' || n.kind === 'horse') && n.tags.length > 0) ?? null
	);
}

export type RaceConditionSource = {
	course: string;
	surface: string | null;
	distance: number | null;
};

/**
 * 「京都 芝2200m」。同じ条件のレースを探す鍵を、そのまま見出しにしたもの。
 *
 * 馬場（芝・ダート）か距離が決まっていないレースでは null。コースだけで束ねると
 * 芝もダートも短距離も長距離も混ざり、「同じ条件」と呼べなくなる。
 */
export function conditionLabel(r: RaceConditionSource): string | null {
	if (!r.surface || !r.distance) return null;
	return `${r.course} ${r.surface}${r.distance}m`;
}
