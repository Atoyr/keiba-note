import { describe, expect, it } from 'vitest';
import type { ResultRow } from './netkeiba.ts';
import { resultNotSettled } from './result-ready.ts';

const winner: ResultRow = { name: 'ホースA', horseId: '1', finish: 1 };

describe('resultNotSettled', () => {
	it('同着と、取消・除外・中止・失格を含む結果は確定とみなす', () => {
		expect(
			resultNotSettled([
				winner,
				{ ...winner, name: 'ホースB', horseId: '2' },
				...['取', '除外', '中', '失格'].map((status, i) => ({
					name: `ホース${i}`,
					horseId: `9${i}`,
					status
				}))
			])
		).toBeNull();
	});

	it('空の表は「まだ出ていない」', () => {
		expect(resultNotSettled([])).toMatch(/まだ出ていません/);
	});

	it('1着がいない表は確定前', () => {
		expect(resultNotSettled([{ ...winner, finish: 2 }])).toMatch(/1着/);
		expect(resultNotSettled([{ ...winner, finish: undefined }])).toMatch(/1着/);
	});

	it('着順も確定した表記も読めない馬がいれば、その馬名を出す', () => {
		expect(resultNotSettled([winner, { name: 'ホースC', horseId: '3', status: '未確定' }])).toMatch(
			/ホースC/
		);
		expect(resultNotSettled([winner, { name: 'ホースD', horseId: '4' }])).toMatch(/ホースD/);
	});
});
