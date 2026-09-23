import { describe, expect, it } from 'vitest';
import type { NoteTag } from '$lib/schemas/note';
import {
	awaitingReview,
	pickWatchlist,
	raceProgress,
	watchVerdict,
	type WatchSourceRow
} from './dashboard';

const TODAY = '2026-09-26';

describe('watchVerdict', () => {
	it('次走買い → buy、次走消し → drop、どちらも無ければ null', () => {
		expect(watchVerdict(['次走買い', '不利'])).toBe('buy');
		expect(watchVerdict(['次走消し'])).toBe('drop');
		expect(watchVerdict(['不利', '好上がり'])).toBeNull();
	});

	it('両方付いていたら買いを取る', () => {
		expect(watchVerdict(['次走消し', '次走買い'])).toBe('buy');
	});
});

const src = (over: Partial<WatchSourceRow> & { noteTags: NoteTag[] }): WatchSourceRow => ({
	entryId: 'e1',
	raceId: 'r1',
	raceDate: '2026-09-27',
	resultCount: 0,
	course: '阪神',
	raceNumber: 11,
	raceName: '神戸新聞杯',
	grade: 'G2',
	horseId: 'h1',
	horseName: 'ホースA',
	horseNumber: 5,
	noteId: 'n1',
	noteBody: '',
	noteOccurredAt: '2026-08-20',
	...over
});

describe('pickWatchlist', () => {
	// 一度買いと書いた馬でも、あとで消しに変えたなら消しが正。
	it('出走ごとに一番新しい結論だけを採る', () => {
		const list = pickWatchlist([
			src({ noteId: 'new', noteTags: ['次走消し'], noteOccurredAt: '2026-09-01' }),
			src({ noteId: 'old', noteTags: ['次走買い'], noteOccurredAt: '2026-06-01' })
		]);

		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ noteId: 'new', verdict: 'drop' });
	});

	it('結論以外の札は理由として添える', () => {
		const [runner] = pickWatchlist([src({ noteTags: ['次走買い', '不利', '馬場向かず'] })]);

		expect(runner.verdict).toBe('buy');
		expect(runner.reasons).toEqual(['不利', '馬場向かず']);
	});

	it('結論の札が無い行は拾わない', () => {
		expect(pickWatchlist([src({ noteTags: ['好上がり'] })])).toEqual([]);
	});

	it('出走の早い順（日付 → R → 馬番）に並べる', () => {
		const list = pickWatchlist([
			src({ entryId: 'sun', raceDate: '2026-09-27', noteTags: ['次走買い'] }),
			src({ entryId: 'sat-11-8', raceDate: '2026-09-26', horseNumber: 8, noteTags: ['次走買い'] }),
			src({ entryId: 'sat-11-2', raceDate: '2026-09-26', horseNumber: 2, noteTags: ['次走消し'] }),
			src({ entryId: 'sat-10', raceDate: '2026-09-26', raceNumber: 10, noteTags: ['次走買い'] })
		]);

		expect(list.map((r) => r.entryId)).toEqual(['sat-10', 'sat-11-2', 'sat-11-8', 'sun']);
	});
});

const race = (over: Partial<Parameters<typeof raceProgress>[0]> = {}) => ({
	date: '2026-09-27',
	resultCount: 0,
	outlookCount: 0,
	markCount: 0,
	reviewCount: 0,
	...over
});

/** 結果が出たレース（着順が入っている）。 */
const settled = (over: Partial<Parameters<typeof raceProgress>[0]> = {}) =>
	race({ resultCount: 16, ...over });

describe('raceProgress', () => {
	it('開催前は見立てと印の済み具合を出す', () => {
		expect(raceProgress(race({ outlookCount: 1, markCount: 3 }), TODAY)).toEqual([
			{ label: '見立て済', tone: 'done' },
			{ label: '印 3頭', tone: 'done' }
		]);
	});

	it('開催前で何も書いていなければ「未着手」', () => {
		expect(raceProgress(race(), TODAY)).toEqual([{ label: '未着手', tone: 'none' }]);
	});

	// 当日でも着順が入るまでは予想の途中。リンク先（予想画面）と札を食い違わせない。
	it('当日でも結果が出るまでは見立てと印の済み具合を出す', () => {
		expect(raceProgress(race({ date: TODAY, markCount: 2 }), TODAY)).toEqual([
			{ label: '印 2頭', tone: 'done' }
		]);
	});

	it('当日に結果が出たら「ふりかえり待ち」', () => {
		expect(raceProgress(settled({ date: TODAY, markCount: 2 }), TODAY)).toEqual([
			{ label: 'ふりかえり待ち', tone: 'todo' }
		]);
	});

	it('ふりかえりがあれば「ふりかえり済」', () => {
		expect(
			raceProgress(settled({ date: '2026-09-20', markCount: 2, reviewCount: 1 }), TODAY)
		).toEqual([{ label: 'ふりかえり済', tone: 'done' }]);
	});

	// 結果の投入より先にふりかえりを書くことはある。書いたものは済として出す。
	it('結果の投入前でも、ふりかえりを書いていれば「ふりかえり済」', () => {
		expect(raceProgress(race({ date: '2026-09-20', reviewCount: 1 }), TODAY)).toEqual([
			{ label: 'ふりかえり済', tone: 'done' }
		]);
	});

	// 予想していないレースにまで宿題の札を付けると、全部が宿題に見える。
	it('結果が出たあと予想もふりかえりも無ければ何も添えない', () => {
		expect(raceProgress(settled({ date: '2026-09-20' }), TODAY)).toEqual([]);
	});

	// 走り終えたのに「未着手」は読めない。結果が入っていなくても開催後なら何も添えない。
	it('結果の投入前の開催後のレースで何も書いていなければ何も添えない', () => {
		expect(raceProgress(race({ date: '2026-09-20' }), TODAY)).toEqual([]);
	});
});

describe('awaitingReview', () => {
	it('予想したのにふりかえっていない、結果の出たレースだけを新しい順に返す', () => {
		const races = [
			settled({ date: '2026-09-13', outlookCount: 1 }),
			settled({ date: '2026-09-20', markCount: 2 }),
			settled({ date: TODAY, markCount: 1 }),
			// 当日で、まだ結果が出ていない
			race({ date: TODAY, outlookCount: 1 }),
			// 開催済みだが結果の投入前
			race({ date: '2026-09-21', markCount: 1 }),
			// ふりかえり済み
			settled({ date: '2026-09-19', markCount: 1, reviewCount: 3 }),
			// 予想していない
			settled({ date: '2026-09-21' }),
			// まだ走っていない
			race({ date: '2026-09-27', outlookCount: 1 })
		];

		expect(awaitingReview(races, TODAY).map((r) => r.date)).toEqual([
			TODAY,
			'2026-09-20',
			'2026-09-13'
		]);
	});
});
