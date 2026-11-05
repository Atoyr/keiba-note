import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { insightWordSchema } from './insight';

describe('insightWordSchema', () => {
	it('全角の英数字を半角に寄せ、前後の空白を除く', () => {
		expect(v.parse(insightWordSchema, '　２４００ｍ延長 ')).toBe('2400m延長');
	});

	it('空や空白だけは受けない', () => {
		expect(v.safeParse(insightWordSchema, '').success).toBe(false);
		expect(v.safeParse(insightWordSchema, '　 ').success).toBe(false);
	});

	it('20字までは通り、21字は文つきで落ちる', () => {
		expect(v.safeParse(insightWordSchema, 'あ'.repeat(20)).success).toBe(true);
		const r = v.safeParse(insightWordSchema, 'あ'.repeat(21));
		expect(r.success).toBe(false);
		expect(r.issues?.[0].message).toBe('言葉は20文字以内で入力してください');
	});
});
