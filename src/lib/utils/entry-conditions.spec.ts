import { describe, expect, it } from 'vitest';
import {
	entryConditions,
	previousRun,
	sameJockey,
	type CurrentConditions,
	type RunForConditions
} from './entry-conditions';

const run = (over: Partial<RunForConditions> = {}): RunForConditions => ({
	finishPosition: 3,
	fieldSize: 16,
	winnerName: null,
	runnerUpName: null,
	jockey: '武豊',
	weightCarried: 56,
	blinker: null,
	...over
});

const now = (over: Partial<CurrentConditions> = {}): CurrentConditions => ({
	jockey: '武豊',
	announcedJockey: null,
	weightCarried: 56,
	blinker: null,
	...over
});

const text = (c: CurrentConditions, runs: RunForConditions[]) =>
	entryConditions(c, runs).map((i) => `${i.lead}${i.rest}`);

describe('previousRun（前走の選び方）', () => {
	it('着順のある最新の走が前走', () => {
		const a = run({ jockey: 'A' });
		expect(previousRun([a, run({ jockey: 'B' })])).toBe(a);
	});

	it('着順が無くてもレースに結果が入っていれば、取消・除外として飛ばす', () => {
		const cancelled = run({ finishPosition: null, fieldSize: 14 });
		const prev = run({ jockey: 'C' });
		expect(previousRun([cancelled, prev])).toBe(prev);
		expect(
			previousRun([run({ finishPosition: null, fieldSize: null, winnerName: 'X' }), prev])
		).toBe(prev);
	});

	it('着順もレースの結果も無い走は、走ったか分からないので前走なし（古い走へ下りない）', () => {
		const unknown = run({ finishPosition: null, fieldSize: null });
		expect(previousRun([unknown, run()])).toBeNull();
	});

	it('過去走が無い・全部取消なら前走なし', () => {
		expect(previousRun([])).toBeNull();
		expect(previousRun([run({ finishPosition: null, fieldSize: 10 })])).toBeNull();
	});
});

describe('sameJockey', () => {
	it('同じか、片方がもう片方の頭と一致（略称）なら同じ', () => {
		expect(sameJockey('川田将雅', '川田将雅')).toBe(true);
		expect(sameJockey('川田将', '川田将雅')).toBe(true);
		expect(sameJockey('川田将雅', '武豊')).toBe(false);
	});
});

describe('entryConditions', () => {
	it('変更あり: 乗り替わり・斤量の増減・ブリンカー着用開始', () => {
		const items = text(now({ jockey: 'ルメール', weightCarried: 57, blinker: true }), [
			run({ jockey: '武豊', weightCarried: 56, blinker: false })
		]);
		expect(items).toEqual([
			'乗り替わり（前走 武豊）',
			'斤量 57kg（前走比 +1kg）',
			'ブリンカー 着用開始'
		]);
	});

	it('変更なし: 同じ騎手は乗り替わりと言わず、斤量は前走と同じ・ブリンカーは着用のまま', () => {
		const items = text(now({ blinker: true }), [run({ blinker: true })]);
		expect(items).toEqual(['斤量 56kg（前走と同じ）', 'ブリンカー 着用']);
	});

	it('略称の前走の騎手は同じとみなす', () => {
		expect(text(now({ jockey: '川田将雅' }), [run({ jockey: '川田将' })])).not.toContain(
			expect.stringContaining('乗り替わり')
		);
	});

	it('比較元なし: 過去走が無ければ、同じとも違うとも言わず今回の値だけ', () => {
		expect(text(now({ blinker: false }), [])).toEqual(['斤量 56kg', 'ブリンカー なし']);
		expect(text(now({ blinker: true }), [])).toEqual(['斤量 56kg', 'ブリンカー 着用']);
	});

	it('一部未取得: 項目ごとに未取得と出し、前走があっても乗り替わりとは言わない', () => {
		const items = text(now({ jockey: null, weightCarried: null }), [run()]);
		expect(items).toEqual(['斤量 未取得', 'ブリンカー 未取得']);
	});

	it('前走の斤量が無ければ増減は言わない', () => {
		expect(text(now(), [run({ weightCarried: null })])[0]).toBe('斤量 56kg');
	});

	it('斤量は 0.5kg 刻みで、減った分は -', () => {
		expect(text(now({ weightCarried: 57.5 }), [run({ weightCarried: 57 })])[0]).toBe(
			'斤量 57.5kg（前走比 +0.5kg）'
		);
		expect(text(now({ weightCarried: 55 }), [run({ weightCarried: 56 })])[0]).toBe(
			'斤量 55kg（前走比 -1kg）'
		);
	});

	it('ブリンカー: 前走は着用で今回なしなら「外す」。前走が不明なら着用でも着用開始とは言わない', () => {
		expect(text(now({ blinker: false }), [run({ blinker: true })])[1]).toBe(
			'ブリンカー 外す（前走は着用）'
		);
		expect(text(now({ blinker: true }), [run({ blinker: null })])[1]).toBe('ブリンカー 着用');
		expect(text(now({ blinker: false }), [run({ blinker: null })])[1]).toBe('ブリンカー なし');
	});

	it('騎手変更: 発表時の騎手と違えば別に出す。再変更でも発表時のまま。戻れば出さない', () => {
		expect(
			text(now({ jockey: '坂井瑠星', announcedJockey: '戸崎圭太' }), [run({ jockey: '戸崎圭太' })])
		).toEqual([
			'乗り替わり（前走 戸崎圭太）',
			'騎手変更（発表時 戸崎圭太）',
			'斤量 56kg（前走と同じ）',
			'ブリンカー 未取得'
		]);
		// 前走と同じ騎手に戻る A→B→A では、騎手変更も乗り替わりも出ない
		expect(
			text(now({ jockey: '武豊', announcedJockey: '武豊' }), [run({ jockey: '武豊' })]).join()
		).not.toMatch(/騎手変更|乗り替わり/);
	});

	it('取消の走は飛ばして、その前の走と比べる', () => {
		const items = text(now({ jockey: 'B' }), [
			run({ finishPosition: null, fieldSize: 10, jockey: 'X' }),
			run({ jockey: 'A' })
		]);
		expect(items[0]).toBe('乗り替わり（前走 A）');
	});

	it('直近の走が結果未投入なら比べない', () => {
		const items = text(now({ jockey: 'B', blinker: true }), [
			run({ finishPosition: null, fieldSize: null, jockey: 'X', blinker: false }),
			run({ jockey: 'A' })
		]);
		expect(items).toEqual(['斤量 56kg', 'ブリンカー 着用']);
	});
});
