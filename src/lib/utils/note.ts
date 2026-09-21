/** メモの見出しを組み立てる。タイムライン・ダッシュボード・予想画面で共通。 */

export type NoteHeadingSource = {
	kind: 'race' | 'horse' | 'entry' | 'preview';
	course?: string | null;
	raceNumber?: number | null;
	raceName?: string | null;
	grade?: string | null;
	finishPosition?: number | null;
	horseName?: string | null;
};

export type NoteHeading = {
	/** 「中山11R オールカマー (G2) 1着」のような見出し。 */
	label: string;
	/** 種別を示す小さな札。既定（レース後のメモ）は null。 */
	tag: '出走前' | '近況' | null;
};

/**
 * 見出しと札を返す。
 *
 * **`preview`（出走前メモ）には着順を出さない。** 書いた時点では着順が無く、
 * あとから結果が入ると「出走前に書いたのに1着と書いてある」ように見えてしまう。
 * 代わりに「出走前」の札を付けて、同じレースのふりかえりメモと区別できるようにする。
 */
export function noteHeading(n: NoteHeadingSource): NoteHeading {
	if (n.kind === 'horse') {
		return { label: n.horseName ?? '', tag: '近況' };
	}

	const race = [
		n.course ? `${n.course}${n.raceNumber ?? ''}R` : null,
		n.raceName,
		n.grade ? `(${n.grade})` : null
	]
		.filter(Boolean)
		.join(' ');

	if (n.kind === 'preview') {
		return { label: race || 'レース', tag: '出走前' };
	}

	const withResult = [race, n.finishPosition ? `${n.finishPosition}着` : null]
		.filter(Boolean)
		.join(' ');

	return { label: withResult || 'レース', tag: null };
}
