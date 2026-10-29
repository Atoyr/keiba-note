import { describe, expect, it } from 'vitest';
import { gradedRaceKey } from './graded-race';
import { GRADED_RACE_PROFILE_ROWS, gradedRaceProfile } from './graded-race-profile';

const rows = Object.entries(GRADED_RACE_PROFILE_ROWS);

describe('重賞の紹介の表', () => {
	it('鍵・優先出走権のレース・ステップレースは、別名ではなく重賞の鍵で書いてある', () => {
		for (const [key, p] of rows) {
			expect(gradedRaceKey(key), key).toBe(key);
			for (const x of p.priority) expect(gradedRaceKey(x.race), `${key}:${x.race}`).toBe(x.race);
			for (const x of p.steps) expect(gradedRaceKey(x), `${key}:${x}`).toBe(x);
		}
	});

	it('優先出走権を与えるレースはすべてステップレースに含まれる', () => {
		for (const [key, p] of rows) {
			for (const x of p.priority) expect(p.steps, `${key}:${x.race}`).toContain(x.race);
		}
	});

	it('コースの特徴の4つは空でない', () => {
		for (const [key, p] of rows) {
			for (const part of ['start', 'middle', 'finish', 'tendency'] as const) {
				expect(p.course[part].trim(), `${key}:${part}`).not.toBe('');
			}
		}
	});
});

describe('gradedRaceProfile', () => {
	it('表に無い鍵は null', () => {
		expect(gradedRaceProfile('オールカマー', '2026-09-27')).toBeNull();
	});

	it('since より前の年は null、since の年は値', () => {
		expect(gradedRaceProfile('天皇賞（秋）', '2025-11-02')).toBeNull();
		expect(gradedRaceProfile('天皇賞（秋）', '2026-11-01')).toMatchObject({
			conditions: '3歳以上オープン 定量'
		});
	});
});
