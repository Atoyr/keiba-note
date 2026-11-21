import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { entriesSchema } from './race';

const row = (over: Record<string, string> = {}) => ({
	horseName: 'ホースA',
	bracket: '',
	horseNumber: '',
	jockey: '',
	finishPosition: '',
	finishStatus: '',
	finishTime: '',
	margin: '',
	last3f: '',
	popularity: '',
	...over
});

describe('entriesSchema の着順が無い理由（finishStatus）', () => {
	it('空は null、取消・除外・中止・失格はそのまま、知らない値は null', () => {
		const out = (finishStatus: string) => {
			const r = v.safeParse(entriesSchema, [row({ finishStatus })]);
			if (!r.success) throw new Error('parse failed');
			return r.output[0].finishStatus;
		};
		expect(out('')).toBeNull();
		expect(out('取消')).toBe('取消');
		expect(out('除外')).toBe('除外');
		expect(out('中止')).toBe('中止');
		expect(out('失格')).toBe('失格');
		expect(out('競走除外')).toBeNull();
	});

	it('着順と状態を両方入れたら誤り', () => {
		const r = v.safeParse(entriesSchema, [row({ finishPosition: '3', finishStatus: '除外' })]);
		expect(r.success).toBe(false);
		expect(r.issues?.[0].message).toBe('着順と取消・除外・中止・失格は一緒に入れられません');
	});

	it('着順だけ・状態だけなら通る', () => {
		expect(v.safeParse(entriesSchema, [row({ finishPosition: '3' })]).success).toBe(true);
		expect(v.safeParse(entriesSchema, [row({ finishStatus: '取消' })]).success).toBe(true);
	});
});
