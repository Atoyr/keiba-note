import { describe, expect, it } from 'vitest';
import { changedFields, countChangedNotes, noteOfField } from './draft';

describe('changedFields', () => {
	it('変わった欄だけを、いまの値で返す', () => {
		const base = { raceNoteBody: ['前残り'], 'body.A': [''], 'tags.A': [] };
		const now = { raceNoteBody: ['前残り'], 'body.A': ['伸びた'], 'tags.A': ['次走買い'] };
		expect(changedFields(now, base)).toEqual({ 'body.A': ['伸びた'], 'tags.A': ['次走買い'] });
	});

	it('札を全部外した欄は、FormData に乗らないので空の配列で返す', () => {
		expect(changedFields({}, { 'tags.A': ['不利'] })).toEqual({ 'tags.A': [] });
	});

	it('前後の空白だけの違いは変更に数えない（サーバーは trim して保存する）', () => {
		expect(changedFields({ 'body.A': ['xyz '] }, { 'body.A': ['xyz'] })).toEqual({});
		expect(changedFields({ 'body.A': ['  '] }, { 'body.A': [''] })).toEqual({});
		expect(changedFields({ 'body.A': ['x y'] }, { 'body.A': ['xy'] })).toEqual({
			'body.A': ['x y']
		});
	});

	it('書いて元に戻した欄は変更に数えない', () => {
		expect(changedFields({ 'body.A': ['同じ'] }, { 'body.A': ['同じ'] })).toEqual({});
	});
});

describe('noteOfField', () => {
	it('本文・札・印は、同じ出走馬なら同じメモ', () => {
		expect(noteOfField('body.A')).toBe('A');
		expect(noteOfField('tags.A')).toBe('A');
		expect(noteOfField('mark.A')).toBe('A');
	});

	it('`.` の無い欄（レースのメモ）はそれだけで1つのメモ', () => {
		expect(noteOfField('raceNoteBody')).toBe('raceNoteBody');
	});
});

describe('countChangedNotes', () => {
	it('1頭に本文・札・印を付けても1件', () => {
		expect(countChangedNotes({ 'body.A': ['x'], 'tags.A': ['不利'], 'mark.A': ['◎'] })).toBe(1);
	});

	it('レースのメモと2頭を変えたら3件', () => {
		expect(
			countChangedNotes({
				raceNoteBody: ['内有利'],
				'body.A': ['x'],
				'tags.B': ['次走買い'],
				'mark.B': ['○']
			})
		).toBe(3);
	});

	it('何も変えていなければ0件', () => {
		expect(countChangedNotes({})).toBe(0);
	});
});
