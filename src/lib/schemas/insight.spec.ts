import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { insightMemoSchema, insightToggleSchema, insightWordSchema } from './insight';

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

describe('insightMemoSchema', () => {
	it('空は可で、前後の空白を除く', () => {
		expect(v.parse(insightMemoSchema, '')).toBe('');
		expect(v.parse(insightMemoSchema, ' 前が壁 ')).toBe('前が壁');
	});

	it('200字までは通り、201字は落ちる', () => {
		expect(v.safeParse(insightMemoSchema, 'あ'.repeat(200)).success).toBe(true);
		expect(v.safeParse(insightMemoSchema, 'あ'.repeat(201)).success).toBe(false);
	});
});

describe('insightToggleSchema', () => {
	it('on が真偽でなければ落ちる', () => {
		expect(
			v.safeParse(insightToggleSchema, { entryId: 'e1', word: '前が壁', on: 'yes' }).success
		).toBe(false);
		expect(
			v.safeParse(insightToggleSchema, { entryId: 'e1', word: '前が壁', on: true }).success
		).toBe(true);
	});
});
