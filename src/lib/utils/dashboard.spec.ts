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
	outlookCount: 0,
	markCount: 0,
	reviewCount: 0,
	...over
});

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

	// 当日は開催前にしない（isUpcoming と同じ線引き）。夕方にはもう走り終えている。
	it('当日は開催後として扱う', () => {
		expect(raceProgress(race({ date: TODAY, markCount: 2 }), TODAY)).toEqual([
			{ label: 'ふりかえり待ち', tone: 'todo' }
		]);
	});

	it('開催後にふりかえりがあれば「ふりかえり済」', () => {
		expect(raceProgress(race({ date: '2026-09-20', markCount: 2, reviewCount: 1 }), TODAY)).toEqual(
			[{ label: 'ふりかえり済', tone: 'done' }]
		);
	});

	// 予想していないレースにまで宿題の札を付けると、全部が宿題に見える。
	it('開催後で予想もふりかえりも無ければ何も添えない', () => {
		expect(raceProgress(race({ date: '2026-09-20' }), TODAY)).toEqual([]);
	});
});

describe('awaitingReview', () => {
	it('予想したのにふりかえっていない開催済みのレースだけを、新しい順に返す', () => {
		const races = [
			race({ date: '2026-09-13', outlookCount: 1 }),
			race({ date: '2026-09-20', markCount: 2 }),
			race({ date: TODAY, markCount: 1 }),
			// ふりかえり済み
			race({ date: '2026-09-19', markCount: 1, reviewCount: 3 }),
			// 予想していない
			race({ date: '2026-09-21' }),
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
