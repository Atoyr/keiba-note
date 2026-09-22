import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	NOTE_TAGS,
	entryNoteSchema,
	horseNoteSchema,
	previewEntrySchema,
	tagsSchema
} from './note';
import { NOTE_TAG_GROUP } from '$lib/utils/note';

const parse = (input: unknown) => v.parse(tagsSchema, input);

/**
 * 札はフォームから `getAll()` で来るので、**中身は何でもありえる**。
 * ここが素通しになると、選択肢に無い文字列がそのまま JSON で D1 に入り、
 * 画面側の色分け（`NOTE_TAG_GROUP` の引き当て）が undefined になる。
 */
describe('tagsSchema', () => {
	it('選択肢にある札だけを通す', () => {
		expect(parse(['次走買い', '不利'])).toEqual(['次走買い', '不利']);
	});

	it('選択肢に無い値は黙って落とす', () => {
		expect(parse(['次走買い', '好きな馬', '<script>', ''])).toEqual(['次走買い']);
	});

	it('重複を落とす', () => {
		expect(parse(['不利', '不利', '不利'])).toEqual(['不利']);
	});

	it('並びを NOTE_TAGS の順に揃える（チェックした順に依存しない）', () => {
		// 同じ組み合わせなら、送られた順が違っても同じ配列になること。
		// ここがずれると、中身が同じでも保存のたびに JSON が変わって差分に見える。
		const a = parse(['好上がり', '不利', '次走買い']);
		const b = parse(['次走買い', '好上がり', '不利']);
		expect(a).toEqual(['次走買い', '不利', '好上がり']);
		expect(b).toEqual(a);
	});

	it('空でも未指定でも空配列になる（null を返さない）', () => {
		expect(parse([])).toEqual([]);
		expect(parse(undefined)).toEqual([]);
	});

	it('すべての札に系統が割り当てられている', () => {
		// 型でも守られているが、札を足したときに色が付かないまま出るのを防ぐ。
		expect(NOTE_TAGS.filter((t) => !NOTE_TAG_GROUP[t])).toEqual([]);
	});
});

describe('メモ入力の各フォーム', () => {
	it('ふりかえりの1頭分は札を配列で受ける', () => {
		const out = v.parse(entryNoteSchema, {
			entryId: 'e1',
			horseId: 'h1',
			body: '  直線で詰まった  ',
			tags: ['不利', '選択肢外']
		});
		expect(out.tags).toEqual(['不利']);
	});

	it('予想の1頭分は札と印を別に持つ', () => {
		const out = v.parse(previewEntrySchema, {
			entryId: 'e1',
			horseId: 'h1',
			body: '',
			tags: ['次走買い'],
			mark: '◎'
		});
		expect(out).toMatchObject({ tags: ['次走買い'], mark: '◎' });
	});

	it('近況メモは札を省略できる', () => {
		const out = v.parse(horseNoteSchema, {
			body: '追い切り良好',
			occurredAt: '2026-09-22'
		});
		expect(out.tags).toEqual([]);
	});
});
