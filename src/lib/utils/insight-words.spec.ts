import { expect, it } from 'vitest';
import * as v from 'valibot';
import { INSIGHT_WORDS_LIMIT, insightWordSchema } from '#lib/schemas/insight.ts';
import { DEFAULT_INSIGHT_WORDS } from './insight-words';

it('おすすめの言葉は全件が言葉の検証を変えずに通り、重複が無く、登録の上限以下', () => {
	for (const w of DEFAULT_INSIGHT_WORDS) {
		const parsed = v.safeParse(insightWordSchema, w);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.output).toBe(w);
	}
	expect(new Set(DEFAULT_INSIGHT_WORDS).size).toBe(DEFAULT_INSIGHT_WORDS.length);
	expect(DEFAULT_INSIGHT_WORDS.length).toBeLessThanOrEqual(INSIGHT_WORDS_LIMIT);
});
