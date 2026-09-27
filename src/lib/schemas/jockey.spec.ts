import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { JOCKEY_TAGS, jockeySummarySchema, parseJockeyTag } from './jockey';
import { COURSES } from './race';

describe('騎手の札', () => {
	it('選択肢に無い札と重複を落とし、選択肢の順に揃える', () => {
		const out = v.parse(jockeySummarySchema, {
			body: '',
			tags: ['穴で怖い', '中山巧者', '勝手な札', '中山巧者']
		});
		expect(out.tags).toEqual(['中山巧者', '穴で怖い']);
	});

	it('札が無ければ空の配列', () => {
		expect(v.parse(jockeySummarySchema, { body: 'x' }).tags).toEqual([]);
	});

	it('JRA の10場すべてに巧者の札がある', () => {
		for (const course of COURSES) expect(JOCKEY_TAGS).toContain(`${course}巧者`);
	});

	it('絞り込みの札は選択肢のどれかでなければ絞らない', () => {
		expect(parseJockeyTag('中山巧者')).toBe('中山巧者');
		expect(parseJockeyTag('中山')).toBeNull();
		expect(parseJockeyTag(null)).toBeNull();
	});
});
