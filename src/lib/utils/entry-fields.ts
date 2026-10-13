import { NOTE_TAGS, type Mark, type NoteTag } from '$lib/schemas/note';

/**
 * 出走馬ごとの入力欄（`mark.{entryId}` / `body.{entryId}` / `tags.{entryId}`）の、いま入力している値。
 *
 * 閉じた行に出す印・メモ・札は、保存済みの値ではなく**いま入力している値（保存前を含む）**から出す。
 * 古い値が出ると、書いたものが消えたように見えるため（pages.md 4-3）。
 * 予想画面とふりかえり画面で同じ仕組みを使う。
 */

/** 欄の種類。名前の頭（`body.` の `body`）。 */
export type EntryField = 'mark' | 'body' | 'tags';

const FIELDS: readonly string[] = ['mark', 'body', 'tags'] satisfies EntryField[];

/** 1頭ぶんの、いま入力している値。触っていない欄は持たない（持たなければ保存済みの値を使う）。 */
export type LiveEntry = { mark?: Mark | null; body?: string; tags?: NoteTag[] };

/**
 * このレースで、画面で入力している値。
 * SvelteKit は別レースでもページを再利用するので、レースの id を添えて、違うレースのものは無いものとして扱う。
 */
export type LiveEntries = { raceId: string; entries: Record<string, LiveEntry> };

export const EMPTY_LIVE: LiveEntries = { raceId: '', entries: {} };

/** 入力欄の name から、欄の種類と出走馬の id を読む。出走馬の欄でなければ null。 */
export function parseEntryField(name: string): { field: EntryField; entryId: string } | null {
	const dot = name.indexOf('.');
	if (dot <= 0) return null;
	const field = name.slice(0, dot);
	const entryId = name.slice(dot + 1);
	if (!entryId || !FIELDS.includes(field)) return null;
	return { field: field as EntryField, entryId };
}

/** フォームの欄（`form.elements` の要素）のうち、値を読むのに要る部分。 */
type Control = { name?: string; value?: string; checked?: boolean };

/**
 * `body.{entryId}` の欄の値と、`tags.{entryId}` のチェック済みの値すべてを、フォームの欄から読む。
 * 札は `NOTE_TAGS` にあるものだけを、その並びで返す。
 */
export function readEntryField(
	field: 'body' | 'tags',
	entryId: string,
	controls: Iterable<Element | Control>
): string | NoteTag[] {
	const name = `${field}.${entryId}`;
	const mine = Array.from(controls as Iterable<Control>).filter((c) => c.name === name);
	if (field === 'body') return mine[0]?.value ?? '';
	const checked = mine.filter((c) => c.checked).map((c) => c.value);
	return NOTE_TAGS.filter((t) => checked.includes(t));
}

/** 1頭ぶんの入力を、既存の値に重ねる。別レースの入力は捨てる。 */
export function withEntry(
	live: LiveEntries,
	raceId: string,
	entryId: string,
	patch: LiveEntry
): LiveEntries {
	const base = live.raceId === raceId ? live.entries : {};
	return { raceId, entries: { ...base, [entryId]: { ...base[entryId], ...patch } } };
}

/**
 * 入力欄 `name` が変わったとき、いまの入力に反映する。
 * 出走馬の本文・札の欄でなければ（印は `MarkPicker` が別に知らせる）同じものを返す。
 */
export function withField(
	live: LiveEntries,
	raceId: string,
	name: string,
	controls: Iterable<Element | Control>
): LiveEntries {
	const parsed = parseEntryField(name);
	if (!parsed || parsed.field === 'mark') return live;
	const value = readEntryField(parsed.field, parsed.entryId, controls);
	return withEntry(live, raceId, parsed.entryId, { [parsed.field]: value });
}

/** このレースの入力。違うレースのものは無いものとして扱う。 */
export function liveOf(live: LiveEntries, raceId: string): Record<string, LiveEntry> {
	return live.raceId === raceId ? live.entries : {};
}

/**
 * 1頭ぶんの、いま見えるべき値。入力を触っていない欄は保存済みの値（無ければ空）。
 * `saved` は保存済みのメモ（無ければ null）。
 */
export function currentEntry(
	entries: Record<string, LiveEntry>,
	entryId: string,
	saved: { mark?: Mark | null; body?: string; tags?: NoteTag[] } | null
): { mark: Mark | null; body: string; tags: NoteTag[] } {
	const live = entries[entryId];
	return {
		mark: live && 'mark' in live ? (live.mark ?? null) : (saved?.mark ?? null),
		body: live?.body ?? saved?.body ?? '',
		tags: live?.tags ?? saved?.tags ?? []
	};
}

/** 閉じた行にメモとして出すものがあるか（本文は前後の空白を除いて見る。札だけでもある）。 */
export function hasMemo(note: { body: string; tags: readonly unknown[] }): boolean {
	return note.body.trim() !== '' || note.tags.length > 0;
}
