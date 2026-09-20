import { describe, expect, it } from 'vitest';
import { isCheckViolation, isUniqueViolation, violatedIndex } from './errors';

/** Drizzle は元のエラーを包んで投げる。その形を再現する。 */
const wrapped = (inner: string) =>
	new Error('Failed query: insert into "race" ...', { cause: new Error(inner) });

describe('isUniqueViolation', () => {
	it('cause に隠れた UNIQUE 違反を見つける', () => {
		expect(isUniqueViolation(wrapped('UNIQUE constraint failed: race.date, race.course'))).toBe(
			true
		);
	});

	it('包まれていないエラーも見る', () => {
		expect(isUniqueViolation(new Error('SQLITE_CONSTRAINT_UNIQUE'))).toBe(true);
	});

	it('無関係なエラーは false', () => {
		expect(isUniqueViolation(wrapped('no such table'))).toBe(false);
		expect(isUniqueViolation(null)).toBe(false);
		expect(isUniqueViolation('boom')).toBe(false);
	});

	it('cause の循環参照で無限ループしない', () => {
		const a = new Error('a');
		a.cause = a;
		expect(isUniqueViolation(a)).toBe(false);
	});
});

describe('isCheckViolation', () => {
	it('note_kind_shape の違反を見つける', () => {
		expect(isCheckViolation(wrapped('CHECK constraint failed: note_kind_shape'))).toBe(true);
	});
});

describe('violatedIndex', () => {
	it('落ちた列名を取り出す', () => {
		expect(violatedIndex(wrapped('UNIQUE constraint failed: race_entry.horse_number'))).toBe(
			'race_entry.horse_number'
		);
	});

	it('UNIQUE 以外なら null', () => {
		expect(violatedIndex(wrapped('no such table'))).toBeNull();
	});
});
