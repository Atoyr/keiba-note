import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { horseProfileSchema } from './horse';

const input = {
	nameKana: '',
	sex: '',
	birthYear: '',
	trainer: '',
	trainingCenter: '',
	sire: '',
	dam: '',
	profileMemo: ''
};

describe('馬のプロフィール', () => {
	it('空欄は null にし、前後の空白を除く', () => {
		expect(v.parse(horseProfileSchema, input)).toEqual({
			nameKana: null,
			sex: null,
			birthYear: null,
			trainer: null,
			trainingCenter: null,
			sire: null,
			dam: null,
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
});
