import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { horseProfileSchema } from './horse';

const input = {
	nameKana: '',
	sex: '',
	birthYear: '',
	birthDate: '',
	trainer: '',
	trainingCenter: '',
	sire: '',
	dam: '',
	damSire: '',
	profileMemo: ''
};

describe('馬のプロフィール', () => {
	it('空欄は null にし、前後の空白を除く', () => {
		expect(v.parse(horseProfileSchema, input)).toEqual({
			nameKana: null,
			sex: null,
			birthYear: null,
			birthDate: null,
			trainer: null,
			trainingCenter: null,
			sire: null,
			dam: null,
			damSire: null,
			profileMemo: null
		});
		expect(v.parse(horseProfileSchema, { ...input, trainer: '  調教師A ' }).trainer).toBe(
			'調教師A'
		);
	});

	it('性別と所属は選択肢を通す。知らない値は落とす', () => {
		const ok = v.parse(horseProfileSchema, { ...input, sex: '牝', trainingCenter: '栗東' });
		expect(ok).toMatchObject({ sex: '牝', trainingCenter: '栗東' });
		expect(v.safeParse(horseProfileSchema, { ...input, sex: '雌' }).success).toBe(false);
		expect(v.safeParse(horseProfileSchema, { ...input, trainingCenter: '北海道' }).success).toBe(
			false
		);
	});

	it('生年は 1900 年より後の整数だけ。それ以外は null', () => {
		const year = (birthYear: string) =>
			v.parse(horseProfileSchema, { ...input, birthYear }).birthYear;
		expect(year('2022')).toBe(2022);
		expect(year('1900')).toBeNull();
		expect(year('abc')).toBeNull();
		expect(year('2022.5')).toBeNull();
	});

	it('生年月日は実在する YYYY-MM-DD だけ。空は null', () => {
		const date = (birthDate: string) => v.safeParse(horseProfileSchema, { ...input, birthDate });
		expect(date('2021-04-04')).toMatchObject({
			success: true,
			output: { birthDate: '2021-04-04' }
		});
		expect(date(' 2024-02-29 ')).toMatchObject({ success: true });
		for (const bad of ['2021-02-30', '2023-02-29', '2021-4-4', '2021/04/04', 'abc']) {
			const r = date(bad);
			expect(r.success).toBe(false);
			expect(r.issues?.[0]?.message).toBe('生年月日を確かめてください');
		}
	});

	it('生年月日があって生年が空なら、生年は生年月日の年にする', () => {
		const r = v.parse(horseProfileSchema, { ...input, birthDate: '2021-04-04' });
		expect(r).toMatchObject({ birthYear: 2021, birthDate: '2021-04-04' });
	});

	it('生年と生年月日の年が違えば落とす。同じなら通す', () => {
		const both = (birthYear: string) =>
			v.safeParse(horseProfileSchema, { ...input, birthYear, birthDate: '2021-04-04' });
		const bad = both('2020');
		expect(bad.success).toBe(false);
		expect(bad.issues?.[0]?.message).toBe('生年と生年月日の年が合いません');
		expect(both('2021').success).toBe(true);
	});

	it('母父は trim して、空なら null', () => {
		expect(v.parse(horseProfileSchema, { ...input, damSire: ' ハハチチ ' }).damSire).toBe(
			'ハハチチ'
		);
	});
});
