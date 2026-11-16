import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '#lib/server/db/test-d1.ts';
import { gradedRaceNames } from '#lib/utils/graded-race.ts';
import {
	buildGradedRacePlacers,
	placersQuery,
	shapePlacerRows,
	summarizeGradedRacePlacers,
	type PlacerRow
} from './graded-race-placers';
import type { SeriesRace } from './graded-races';

describe('placersQuery', () => {
	let state: ReturnType<typeof createTestDb>;
	beforeEach(() => {
		state = createTestDb();
		state.sqlite.exec(`
			INSERT INTO horse (id,name,sire,dam_sire) VALUES
				('h1','イチバンボシ','父A','母父A'), ('h2','ニバンテ',NULL,NULL),
				('h3','サンバンテ','父C',NULL), ('h4','ヨンバンテ',NULL,NULL), ('h5','ゴバンテ',NULL,NULL);
			INSERT INTO race (id,date,course,race_number,name,grade,surface,distance) VALUES
				('r25','2025-09-28','中山',11,'産経賞オールカマー','G2','芝',2200),
				('r24','2024-09-22','中山',11,'オールカマー','G3','芝',2200),
				('r16','2016-09-25','中山',11,'オールカマー','G2','芝',2200),
				('r15','2015-09-27','中山',11,'オールカマー','G2','芝',2200),
				('r26','2026-09-27','中山',11,'オールカマー','G2','芝',2200),
				('ox','2025-10-05','東京',11,'毎日王冠','G2','芝',1800);
			INSERT INTO race_entry (id,race_id,horse_id,horse_number,jockey,popularity,finish_position) VALUES
				('e25-3','r25','h3',7,'騎手C',3,3),
				('e25-1','r25','h1',5,'騎手A',1,1),
				('e25-2','r25','h2',3,NULL,NULL,2),
				('e25-4','r25','h4',2,'騎手D',4,4),
				('e25-n','r25','h5',9,'騎手E',5,NULL),
				('e24-1','r24','h1',1,'騎手A',2,1),
				('e16-1','r16','h1',1,'騎手A',2,1),
				('e15-1','r15','h1',1,'騎手A',2,1),
				('e26-1','r26','h1',1,'騎手A',2,1),
				('ox-1','ox','h1',1,'騎手A',2,1);
		`);
	});
	afterEach(() => state.sqlite.close());

	const list = (names: string[], from = '2016-01-01', to = '2025-12-31') =>
		names.length === 0
			? Promise.resolve([])
			: placersQuery(state.db, names, from, to).then(shapePlacerRows);

	it('別名のレースも拾い、日付の降順 → 着順 → 馬番で並ぶ', async () => {
		const rows = await list(gradedRaceNames('オールカマー'));
		expect(rows.map((r) => r.entryId)).toEqual(['e25-1', 'e25-2', 'e25-3', 'e24-1', 'e16-1']);
	});

	it('4着以下と着順なし、窓の外（両端の外）、別のレースは拾わない', async () => {
		const rows = await list(gradedRaceNames('オールカマー'));
		const ids = rows.map((r) => r.entryId);
		expect(ids).not.toContain('e25-4');
		expect(ids).not.toContain('e25-n');
		expect(ids).not.toContain('e15-1');
		expect(ids).not.toContain('e26-1');
		expect(ids).not.toContain('ox-1');
	});

	it('日付の窓は両端を含む', async () => {
		const rows = await list(gradedRaceNames('オールカマー'), '2016-09-25', '2024-09-22');
		expect(rows.map((r) => r.entryId)).toEqual(['e24-1', 'e16-1']);
	});

	it('出走と馬の列を返し、父・母父・人気・騎手は null のまま返す', async () => {
		const rows = await list(gradedRaceNames('オールカマー'));
		expect(rows[0]).toEqual({
			raceId: 'r25',
			entryId: 'e25-1',
			finishPosition: 1,
			popularity: 1,
			jockey: '騎手A',
			horseNumber: 5,
			horseId: 'h1',
			horseName: 'イチバンボシ',
			sire: '父A',
			damSire: '母父A'
		});
		expect(rows[1]).toMatchObject({ popularity: null, jockey: null, sire: null, damSire: null });
	});
});

const raceOf = (id: string, date: string, over: Partial<SeriesRace> = {}): SeriesRace => ({
	id,
	date,
	course: '中山',
	raceNumber: 11,
	name: 'オールカマー',
	grade: 'G2',
	surface: '芝',
	distance: 2200,
	trackCondition: '良',
	winnerName: null,
	resultCount: 0,
	...over
});

let seq = 0;
const row = (raceId: string, finishPosition: number, over: Partial<PlacerRow> = {}): PlacerRow => {
	seq++;
	return {
		raceId,
		entryId: `e${seq}`,
		finishPosition,
		popularity: 1,
		jockey: '騎手A',
		horseNumber: seq,
		horseId: `h${seq}`,
		horseName: `馬${seq}`,
		sire: '父A',
		damSire: '母父A',
		...over
	};
};

const base = raceOf('r25', '2025-09-28');
const opts = { fromYear: 2016, toYear: 2025, base };

describe('buildGradedRacePlacers', () => {
	it('窓の10年が全部降順で並ぶ。欠けた年は races: [] で、missingYears に入る', () => {
		const view = buildGradedRacePlacers(
			[base],
			[row('r25', 1), row('r25', 2), row('r25', 3)],
			opts
		);
		expect(view.years.map((y) => y.year)).toEqual([
			'2025',
			'2024',
			'2023',
			'2022',
			'2021',
			'2020',
			'2019',
			'2018',
			'2017',
			'2016'
		]);
		expect(view.years[0].races).toHaveLength(1);
		expect(view.years[1].races).toEqual([]);
		expect(view.counts.missingYears).toEqual([
			'2024',
			'2023',
			'2022',
			'2021',
			'2020',
			'2019',
			'2018',
			'2017',
			'2016'
		]);
		expect(view.baseYear).toBe('2025');
	});

	it('窓の外（今年・11年以上前）のレースと好走馬は入れない', () => {
		const view = buildGradedRacePlacers(
			[base, raceOf('r26', '2026-09-27'), raceOf('r15', '2015-09-27')],
			[row('r25', 1), row('r26', 1), row('r15', 1)],
			opts
		);
		expect(view.years.flatMap((y) => y.races.map((r) => r.race.id))).toEqual(['r25']);
		expect(view.counts.placers).toBe(1);
	});

	it('同着（1着2頭・3着2頭）は欠けとせず、そろった開催に数える', () => {
		const view = buildGradedRacePlacers(
			[base],
			[row('r25', 1), row('r25', 1), row('r25', 3), row('r25', 3)],
			opts
		);
		expect(view.years[0].races[0].complete).toBe(true);
		expect(view.counts).toMatchObject({ complete: 1, partial: 0, placers: 4, winners: 2 });
	});

	it('着順の行が欠けた開催（1・3・3、2・3・3）は、そろった扱いにしない。1・2・2 と 1・2・3・3 はそろう', () => {
		const completeOf = (positions: number[]) =>
			buildGradedRacePlacers(
				[base],
				positions.map((n) => row('r25', n)),
				opts
			).years[0].races[0].complete;
		expect(completeOf([1, 3, 3])).toBe(false);
		expect(completeOf([2, 3, 3])).toBe(false);
		expect(completeOf([1, 2, 2])).toBe(true);
		expect(completeOf([1, 2, 3, 3])).toBe(true);
		expect(completeOf([1, 1, 3])).toBe(true);
	});

	it('一部だけの開催と、結果なしの開催を数え分ける', () => {
		const view = buildGradedRacePlacers(
			[base, raceOf('r24', '2024-09-22'), raceOf('r23', '2023-09-24'), raceOf('r22', '2022-09-25')],
			[
				row('r25', 1),
				row('r25', 2),
				row('r25', 3),
				row('r24', 1),
				row('r22', 2),
				row('r22', 3),
				row('r22', 3)
			],
			opts
		);
		// 2022 は1着がいないので一部だけ。
		expect(view.counts).toMatchObject({ complete: 1, partial: 2, noResult: 1 });
		expect(view.counts.missingYears).not.toContain('2023');
		expect(view.years.find((y) => y.year === '2023')!.races[0].placers).toEqual([]);
	});

	it('場・芝ダ・距離のどれかが base と違えば differs。結果のある開催だけ counts.differs に数える', () => {
		const view = buildGradedRacePlacers(
			[
				base,
				raceOf('r24', '2024-09-22', { course: '新潟' }),
				raceOf('r23', '2023-09-24', { distance: 2000 }),
				raceOf('r22', '2022-09-25', { surface: 'ダート' }),
				raceOf('r21', '2021-09-26', { course: '阪神' }),
				raceOf('r20', '2020-09-27', { trackCondition: '重' })
			],
			[row('r25', 1), row('r24', 1), row('r23', 1), row('r22', 1), row('r20', 1)],
			opts
		);
		const differs = (year: string) => view.years.find((y) => y.year === year)!.races[0].differs;
		expect(differs('2025')).toBe(false);
		expect(differs('2024')).toBe(true);
		expect(differs('2023')).toBe(true);
		expect(differs('2022')).toBe(true);
		expect(differs('2021')).toBe(true);
		// 馬場は条件の違いに入れない。
		expect(differs('2020')).toBe(false);
		// 2021 は結果が無いので数えない。
		expect(view.counts.differs).toBe(3);
	});

	it('同じ年に同じ鍵のレースが2つあれば両方出す', () => {
		const view = buildGradedRacePlacers(
			[base, raceOf('r25b', '2025-03-01', { raceNumber: 10 })],
			[row('r25', 1), row('r25b', 1)],
			opts
		);
		expect(view.years[0].races.map((r) => r.race.id)).toEqual(['r25', 'r25b']);
	});

	it('同じ馬・同じ騎手の複数年は、それぞれ数える', () => {
		const view = buildGradedRacePlacers(
			[base, raceOf('r24', '2024-09-22')],
			[
				row('r25', 1, { horseId: 'same', jockey: 'ルメ' }),
				row('r24', 3, { horseId: 'same', jockey: 'ルメ' })
			],
			opts
		);
		const jockey = view.aspects.find((a) => a.key === 'jockey')!;
		expect(jockey.rows).toEqual([
			{
				value: 'ルメ',
				wins: 1,
				placed: 2,
				sources: [
					{ year: '2025', finishPosition: 1 },
					{ year: '2024', finishPosition: 3 }
				]
			}
		]);
	});

	it('null・空の人気・騎手・父・母父は unknown に数え、rows に入れない。known + unknown = placers', () => {
		const view = buildGradedRacePlacers(
			[base],
			[
				row('r25', 1, { popularity: null, jockey: null, sire: null, damSire: null }),
				row('r25', 2, { jockey: '', sire: '  ', damSire: '母父B' }),
				row('r25', 3)
			],
			opts
		);
		for (const a of view.aspects) expect(a.known + a.unknown).toBe(view.counts.placers);
		const by = (key: string) => view.aspects.find((a) => a.key === key)!;
		expect(by('popularity')).toMatchObject({ known: 2, unknown: 1 });
		expect(by('jockey')).toMatchObject({ known: 1, unknown: 2 });
		expect(by('sire')).toMatchObject({ known: 1, unknown: 2 });
		expect(by('damSire')).toMatchObject({ known: 2, unknown: 1 });
		expect(by('jockey').rows.map((r) => r.value)).toEqual(['騎手A']);
		// 一覧の側も、空は null に直す。
		expect(view.years[0].races[0].placers.map((p) => p.jockey)).toEqual([null, null, '騎手A']);
	});

	it('人気は段に寄せ、0件の段も決まった順で出す', () => {
		const pops = [1, 5, 6, 9, 10, 18];
		const view = buildGradedRacePlacers(
			[base],
			pops.map((popularity) => row('r25', 1, { popularity })),
			opts
		);
		const pop = view.aspects.find((a) => a.key === 'popularity')!;
		expect(pop.rows.map((r) => [r.value, r.placed])).toEqual([
			['1番人気', 1],
			['2番人気', 0],
			['3番人気', 0],
			['4番人気', 0],
			['5番人気', 1],
			['6〜9番人気', 2],
			['10番人気以下', 2]
		]);
		expect(pop.rows[0].wins).toBe(1);
	});

	it('観点の順は 人気・騎手・父・母父', () => {
		const view = buildGradedRacePlacers([base], [], opts);
		expect(view.aspects.map((a) => a.key)).toEqual(['popularity', 'jockey', 'sire', 'damSire']);
	});

	it('騎手・父・母父は 3着以内 → 勝ち馬 → 名前の順。sources は年の降順 → 着順', () => {
		const view = buildGradedRacePlacers(
			[base, raceOf('r24', '2024-09-22')],
			[
				row('r25', 2, { jockey: 'ア' }),
				row('r25', 3, { jockey: 'イ' }),
				row('r24', 1, { jockey: 'イ' }),
				row('r25', 1, { jockey: 'ウ' }),
				row('r24', 2, { jockey: 'ウ' }),
				row('r24', 3, { jockey: 'エ' })
			],
			opts
		);
		const jockey = view.aspects.find((a) => a.key === 'jockey')!;
		// イ・ウは2回で、勝ちも1回ずつ。同じなら名前順。ア・エは1回。
		expect(jockey.rows.map((r) => r.value)).toEqual(['イ', 'ウ', 'ア', 'エ']);
		expect(jockey.rows[0].sources).toEqual([
			{ year: '2025', finishPosition: 3 },
			{ year: '2024', finishPosition: 1 }
		]);
	});

	it('1年の中の好走馬は着順 → 馬番で並ぶ', () => {
		const view = buildGradedRacePlacers(
			[base],
			[
				row('r25', 3, { horseNumber: 1 }),
				row('r25', 1, { horseNumber: 9 }),
				row('r25', 1, { horseNumber: 4 })
			],
			opts
		);
		expect(view.years[0].races[0].placers.map((p) => p.finishPosition)).toEqual([1, 1, 3]);
	});
});

describe('summarizeGradedRacePlacers', () => {
	it('開催の内訳・条件違い・人気の段と分かる数を小さな形にする', () => {
		const view = buildGradedRacePlacers(
			[
				base,
				raceOf('r24', '2024-09-22'),
				raceOf('r23', '2023-09-24'),
				raceOf('r22', '2022-09-25', { course: '新潟' })
			],
			[
				row('r25', 1, { popularity: 1 }),
				row('r25', 2, { popularity: 3 }),
				row('r25', 3, { popularity: null }),
				row('r24', 1, { popularity: 7 }),
				row('r22', 1, { popularity: 3 }),
				row('r22', 2, { popularity: 3 }),
				row('r22', 3, { popularity: 3 })
			],
			opts
		);
		const summary = summarizeGradedRacePlacers(view);
		expect(summary).toMatchObject({
			fromYear: 2016,
			toYear: 2025,
			baseYear: '2025',
			complete: 2,
			// 2024 は1着だけ。
			partial: 1,
			// 結果が無い2023。
			noResult: 1,
			// レースが無い6年。
			missingYears: 6,
			// 結果のある開催のうち新潟の2022。
			differs: 1,
			winners: 3,
			placers: 7
		});
		expect(summary.popularity).toMatchObject({ known: 6, unknown: 1 });
		expect(summary.popularity.rows).toHaveLength(7);
		expect(summary.popularity.rows[2]).toEqual({ value: '3番人気', wins: 1, placed: 4 });
		expect(summary.popularity.rows[5]).toEqual({ value: '6〜9番人気', wins: 1, placed: 1 });
	});
});
