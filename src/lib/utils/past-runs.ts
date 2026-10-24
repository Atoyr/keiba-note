import type { Mark, NoteTag } from '$lib/schemas/note';

/**
 * 馬柱（`PastRuns` の縦の表と `PastRunsStrip` の横の帯）が共有する、1走ぶんの型と書式。
 *
 * 型はサーバーの `listPastRuns` の戻り値と同じ形だが、**画面側の型としてここで持つ**
 * （画面側はサーバーのコードを型ですら import しない。architecture.md 第2章）。
 * 渡す側（予想画面の PageData）との食い違いは svelte-check が見る。
 */
export type PastRun = {
	entryId?: string;
	notes?: { id: string; kind: string; body: string; tags: NoteTag[]; mark: Mark | null }[];
	raceId: string;
	date: string;
	course: string;
	raceNumber: number | null;
	raceName: string | null;
	grade: string | null;
	className: string | null;
	surface: string | null;
	distance: number | null;
	trackCondition: string | null;
	fieldSize: number | null;
	winnerName: string | null;
	runnerUpName: string | null;
	/** 勝ち馬とのタイム差（秒）。勝った走は2着との差が負で入る。 */
	timeDiff: number | null;
	bracket: number | null;
	horseNumber: number | null;
	finishPosition: number | null;
	popularity: number | null;
	last3f: number | null;
	finishTime: string | null;
	passing: string | null;
	jockey: string | null;
};

/**
 * `2026-09-06` → `26/09/06`。年は2桁で残す。休み明けで5走が年をまたぐと、
 * 月日だけでは前走からの間隔も、何年前の走りかも読めない。
 */
export const ymd = (d: string) => d.slice(2).replaceAll('-', '/');

/** `3-5`（枠-馬番）。片方だけなら単位を付けて `3枠` / `5番`（裸の数字だと枠と読まれる）。どちらも無ければ `—`。 */
export const post = (r: PastRun) =>
	r.bracket && r.horseNumber
		? `${r.bracket}-${r.horseNumber}`
		: r.bracket
			? `${r.bracket}枠`
			: r.horseNumber
				? `${r.horseNumber}番`
				: '—';

/** `3/16`（着順/頭数）。頭数が無ければ `3着`。着順が無くても頭数があれば `—/16`、どちらも無ければ `—`。頭数は取得元の値。 */
export const finish = (r: PastRun) =>
	r.finishPosition === null
		? r.fieldSize
			? `—/${r.fieldSize}`
			: '—'
		: r.fieldSize
			? `${r.finishPosition}/${r.fieldSize}`
			: `${r.finishPosition}着`;

/** レース名。付いていなければ `中山11R`。 */
export const title = (r: PastRun) => r.raceName ?? `${r.course}${r.raceNumber ?? ''}R`;

/**
 * 比べる相手。負けた走は勝ち馬、勝った走は2着馬（新聞の馬柱と同じ）。
 * タイム差は取得元の表記のまま（勝った走は `-0.2` と負になる）。
 */
export const rival = (r: PastRun) => {
	// 着順の無い走（取消・中止・結果が未入力）は、負けたのでも勝ったのでもない。勝ち馬を出すと負けたように読める。
	if (r.finishPosition === null) return null;
	const won = r.finishPosition === 1;
	const name = won ? r.runnerUpName : r.winnerName;
	const diff = r.timeDiff === null ? '' : `（${r.timeDiff.toFixed(1)}）`;
	return name || diff ? { label: won ? '2着馬' : '勝ち馬', text: `${name ?? ''}${diff}` } : null;
};

/** `芝2000良` のような1かたまり。欠けている要素は詰める。 */
export const cond = (r: PastRun) =>
	[r.surface, r.distance ? `${r.distance}m` : null, r.trackCondition].filter(Boolean).join('');

/** 掲示板（5着以内）を少し強める。拾い読みで着順だけ追えるように。 */
export const tone = (p: number | null) =>
	p === null
		? 'text-muted-foreground'
		: p === 1
			? 'font-bold text-red-700'
			: p <= 5
				? 'font-medium'
				: '';
