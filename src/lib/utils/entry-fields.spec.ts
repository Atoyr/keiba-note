import { describe, expect, it } from 'vitest';
import {
	currentEntry,
	EMPTY_LIVE,
	hasMemo,
	liveOf,
	parseEntryField,
	readEntryField,
	withEntry,
	withField
} from './entry-fields';

describe('parseEntryField', () => {
	it('出走馬の欄の name から欄の種類と entryId を読む', () => {
		expect(parseEntryField('body.e1')).toEqual({ field: 'body', entryId: 'e1' });
		expect(parseEntryField('tags.e1')).toEqual({ field: 'tags', entryId: 'e1' });
		expect(parseEntryField('mark.e1')).toEqual({ field: 'mark', entryId: 'e1' });
	});
	it('entryId に点が入っていても最初の点で分ける', () => {
		expect(parseEntryField('body.a.b')).toEqual({ field: 'body', entryId: 'a.b' });
	});
	it('出走馬の欄でなければ null', () => {
		expect(parseEntryField('raceNoteBody')).toBeNull();
		expect(parseEntryField('flow.pace')).toBeNull();
		expect(parseEntryField('body.')).toBeNull();
		expect(parseEntryField('.e1')).toBeNull();
		expect(parseEntryField('')).toBeNull();
	});
});

describe('readEntryField', () => {
	const controls = [
		{ name: 'body.e1', value: '内枠が向く' },
		{ name: 'body.e2', value: '別の馬' },
		{ name: 'tags.e1', value: '次走買い', checked: true },
		{ name: 'tags.e1', value: '不利', checked: false },
		{ name: 'tags.e1', value: '好上がり', checked: true },
		{ name: 'tags.e2', value: '次走買い', checked: true },
		{ name: undefined, value: 'x' }
	];
	it('本文はその name の欄の値', () => {
		expect(readEntryField('body', 'e1', controls)).toBe('内枠が向く');
		expect(readEntryField('body', 'e9', controls)).toBe('');
	});
	it('札はその name のチェック済みの値すべて（NOTE_TAGS の並び）。他の馬の札は混ざらない', () => {
		const tags = readEntryField('tags', 'e1', controls) as string[];
		expect(tags).toContain('次走買い');
		expect(tags).toContain('好上がり');
		expect(tags).not.toContain('不利');
		expect(readEntryField('tags', 'e9', controls)).toEqual([]);
	});
	it('NOTE_TAGS に無い値は札にしない', () => {
		expect(
			readEntryField('tags', 'e1', [{ name: 'tags.e1', value: 'でたらめ', checked: true }])
		).toEqual([]);
	});
});

describe('withField / withEntry / liveOf', () => {
	const controls = [
		{ name: 'body.e1', value: '書いた' },
		{ name: 'tags.e1', value: '次走買い', checked: true }
	];
	it('本文の欄が変わったら、その馬の本文を持つ（札は触らない）', () => {
		const a = withField(EMPTY_LIVE, 'r1', 'body.e1', controls);
		expect(liveOf(a, 'r1')).toEqual({ e1: { body: '書いた' } });
		const b = withField(a, 'r1', 'tags.e1', controls);
		expect(liveOf(b, 'r1')).toEqual({ e1: { body: '書いた', tags: ['次走買い'] } });
	});
	it('出走馬の欄でない・印の欄は同じものを返す', () => {
		expect(withField(EMPTY_LIVE, 'r1', 'raceNoteBody', controls)).toBe(EMPTY_LIVE);
		expect(withField(EMPTY_LIVE, 'r1', 'mark.e1', controls)).toBe(EMPTY_LIVE);
	});
	it('別レースの入力は捨てる（ページの再利用）', () => {
		const a = withEntry(EMPTY_LIVE, 'r1', 'e1', { body: '前のレース' });
		expect(liveOf(a, 'r2')).toEqual({});
		const b = withEntry(a, 'r2', 'e2', { body: '今のレース' });
		expect(liveOf(b, 'r2')).toEqual({ e2: { body: '今のレース' } });
		expect(liveOf(b, 'r1')).toEqual({});
	});
});

describe('currentEntry', () => {
	const saved = { mark: '◎' as const, body: '保存済み', tags: ['次走買い' as const] };
	it('入力が無ければ保存済みの値、保存済みも無ければ空', () => {
		expect(currentEntry({}, 'e1', saved)).toEqual(saved);
		expect(currentEntry({}, 'e1', null)).toEqual({ mark: null, body: '', tags: [] });
	});
	it('触った欄だけ入力の値に替える。空にしたら空になる', () => {
		expect(currentEntry({ e1: { body: '' } }, 'e1', saved)).toEqual({
			mark: '◎',
			body: '',
			tags: ['次走買い']
		});
		expect(currentEntry({ e1: { tags: [] } }, 'e1', saved).tags).toEqual([]);
		expect(currentEntry({ e1: { mark: null } }, 'e1', saved).mark).toBeNull();
		expect(currentEntry({ e1: { mark: '○' } }, 'e1', saved).mark).toBe('○');
	});
});

describe('hasMemo', () => {
	it('本文（空白を除く）か札があればメモがある', () => {
		expect(hasMemo({ body: '', tags: [] })).toBe(false);
		expect(hasMemo({ body: '  \n', tags: [] })).toBe(false);
		expect(hasMemo({ body: '内枠', tags: [] })).toBe(true);
		expect(hasMemo({ body: '', tags: ['次走買い'] })).toBe(true);
	});
});
