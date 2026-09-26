import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { publicNameSchema } from './profile';

describe('公開用の名前', () => {
	it('前後の空白を除き、空欄も受け付ける', () => {
		expect(v.parse(publicNameSchema, { publicName: '  うま日和  ' }).publicName).toBe('うま日和');
		expect(v.parse(publicNameSchema, { publicName: '　 ' }).publicName).toBe('');
	});
	it('30文字の境界を検証し、文字列でない値を拒否する', () => {
		expect(v.safeParse(publicNameSchema, { publicName: 'あ'.repeat(30) }).success).toBe(true);
		expect(v.safeParse(publicNameSchema, { publicName: 'あ'.repeat(31) }).success).toBe(false);
		expect(v.safeParse(publicNameSchema, { publicName: null }).success).toBe(false);
	});
});
