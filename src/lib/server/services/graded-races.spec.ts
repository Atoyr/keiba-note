import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { gradedRaceNames } from '$lib/utils/graded-race';
import {
	buildGradedRaceList,
	buildGradedRaceTimeline,
	currentGrade,
	getGradedRaceTrend,
	listGradedRaceTrendKeys,
	listGradedRacesOfYear,
	listNotedGradedYears,
	listSeriesNotes,
	listSeriesRaces,
	saveGradedRaceTrend,
	type SeriesMark,
	type SeriesNote,
	type SeriesRace
} from './graded-races';

let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id,name) VALUES ('h1','イチバンボシ'), ('h2','ニバンテ'), ('h3','サンバンテ');
		INSERT INTO race (id,date,course,race_number,name,grade,surface,distance,winner_name) VALUES
			('r26','2026-09-27','中山',11,'オールカマー','G2','芝',2200,NULL),
			('r25','2025-09-28','中山',11,'産経賞オールカマー','G2','芝',2200,'イチバンボシ'),
			('r24','2024-09-22','中山',11,'オールカマー','G3','芝',2200,NULL),
			('x26','2026-05-02','東京',11,'E2E特別','OP','芝',1600,NULL),
			('y26','2026-10-04','東京',11,'東京ダート重賞','G3','ダート',1600,NULL),
			('y25','2025-10-05','東京',11,'前年の一般戦',NULL,'ダート',1600,NULL);
		INSERT INTO race_entry (id,race_id,horse_id,horse_number,finish_position) VALUES
			('e1','r25','h1',5,1),
			('e2','r25','h2',3,4),
			('e3','r25','h3',NULL,NULL),
			('e4','y25','h1',1,1);
		INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,mark,flow,occurred_at) VALUES
			('n1','a','race_preview','r25',NULL,NULL,'去年の見立て。','[]',NULL,'{"pace":"スロー","start":{"spots":[],"memo":""},"corner4":{"spots":[],"memo":""},"finish":{"spots":[],"memo":""}}','2025-09-28'),
			('n2','a','race','r25',NULL,NULL,'去年のふりかえり。','["不利"]',NULL,NULL,'2025-09-28'),
			('n3','a','preview','r25','h1','e1','1頭ごとのメモ。','[]','◎',NULL,'2025-09-28'),
			('n4','a','preview','r25','h2','e2','','[]','▲',NULL,'2025-09-28'),
			('n5','a','preview','r25','h3','e3','印なし。','[]',NULL,NULL,'2025-09-28'),
			('n6','b','race_preview','r25',NULL,NULL,'他人の見立て。','[]',NULL,NULL,'2025-09-28'),
			('n7','b','preview','r25','h1','e1','他人の印。','[]','○',NULL,'2025-09-28'),
			('n8','a','race','x26',NULL,NULL,'重賞でないレースのメモ。','[]',NULL,NULL,'2026-05-02'),
			('n9','a','entry','r25','h1','e1','走ったあとの1頭のメモ。','[]',NULL,NULL,'2025-09-28');
	`);
});
afterEach(() => state.sqlite.close());

describe('今年の重賞', () => {
	it('今年の G1〜G3 だけが日付の昇順で並ぶ（OP・去年のレースは出ない）', async () => {
		const races = await listGradedRacesOfYear(state.db, '2026');
		expect(races.map((r) => r.id)).toEqual(['r26', 'y26']);
	});

	it('今年のレースを鍵で1本にし、メモのある年と傾向を重ねる', async () => {
		const races = await listGradedRacesOfYear(state.db, '2026');
		const items = buildGradedRaceList(
			races,
			await listNotedGradedYears(state.db, 'a'),
			await listGradedRaceTrendKeys(state.db, 'a')
		);
		expect(items.map((i) => [i.key, i.grade, i.notedYears, i.hasTrend])).toEqual([
			['オールカマー', 'G2', 1, false],
			['東京ダート重賞', 'G3', 0, false]
		]);
	});

	it('同じ鍵が今年に2つあれば早いほうを使う', () => {
		const base = { course: '中山', raceNumber: 11, grade: 'G2', surface: '芝', distance: 2200 };
		const items = buildGradedRaceList(
			[
				{ id: 'late', date: '2026-10-10', name: 'オールカマー', ...base },
				{ id: 'early', date: '2026-09-27', name: '産経賞オールカマー', ...base }
			] as Parameters<typeof buildGradedRaceList>[0],
			[],
			[]
		);
		expect(items.map((i) => i.raceId)).toEqual(['early']);
		expect(items[0].key).toBe('オールカマー');
	});

	it('メモのある年は、別名のレース名も同じ鍵に数える。他人のメモは数えない', async () => {
		const mine = await listNotedGradedYears(state.db, 'a');
		expect(mine.map((n) => `${n.name}:${n.year}`).sort()).toEqual([
			'E2E特別:2026',
			'産経賞オールカマー:2025'
		]);
		const others = await listNotedGradedYears(state.db, 'b');
		expect(others.map((n) => `${n.name}:${n.year}`)).toEqual(['産経賞オールカマー:2025']);
		expect(await listNotedGradedYears(state.db, 'nobody')).toEqual([]);
	});

	it('印の無い1頭ごとのメモ（出走前・ふりかえり）だけの年も数える', async () => {
		state.sqlite.exec(`
			INSERT INTO race_entry (id,race_id,horse_id,horse_number) VALUES ('e5','r24','h1',1);
			INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,mark,occurred_at) VALUES
				('n10','b','preview','r24','h1','e5','印の無い出走前メモ。','[]',NULL,'2024-09-22');
		`);
		const years = (await listNotedGradedYears(state.db, 'b')).map((n) => `${n.name}:${n.year}`);
		expect(years.sort()).toEqual(['オールカマー:2024', '産経賞オールカマー:2025']);
		expect((await listNotedGradedYears(state.db, 'a')).some((n) => n.year === '2024')).toBe(false);
	});
});

describe('重賞のレースとメモ', () => {
	it('別名の名前の過去のレースが同じ重賞に入り、日付の降順で並ぶ', async () => {
		const races = await listSeriesRaces(state.db, gradedRaceNames('オールカマー'));
		expect(races.map((r) => r.id)).toEqual(['r26', 'r25', 'r24']);
		expect(races[1]).toMatchObject({ winnerName: 'イチバンボシ', resultCount: 2 });
		expect(await listSeriesRaces(state.db, [])).toEqual([]);
	});

	it('メモは自分のレース全体のメモと印だけ（他人のメモ・印なし・別のレースは出ない）', async () => {
		const names = gradedRaceNames('オールカマー');
		const { notes, marks } = await listSeriesNotes(state.db, names, 'a');
		expect(notes.map((n) => [n.id, n.kind, n.pace])).toEqual([
			['n1', 'race_preview', 'スロー'],
			['n2', 'race', null]
		]);
		expect(marks.map((m) => m.entryId).sort()).toEqual(['e1', 'e2']);
		expect(marks.map((m) => [m.mark, m.horseName, m.horseNumber, m.finishPosition]).sort()).toEqual(
			[
				['▲', 'ニバンテ', 3, 4],
				['◎', 'イチバンボシ', 5, 1]
			].sort()
		);

		const other = await listSeriesNotes(state.db, names, 'b');
		expect(other.notes.map((n) => n.id)).toEqual(['n6']);
		expect(other.marks.map((m) => m.mark)).toEqual(['○']);

		expect(await listSeriesNotes(state.db, ['E2E特別'], 'b')).toEqual({
			notes: [],
			marks: [],
			entryNoteCounts: {}
		});
	});

	it('1頭ごとのメモの件数は、レースごとに自分の出走前（印なしも）とふりかえりを数える', async () => {
		const names = gradedRaceNames('オールカマー');
		// a: n3・n4・n5（出走前。n5 は印なし）と n9（ふりかえり）。他人の n7 は数えない。
		expect((await listSeriesNotes(state.db, names, 'a')).entryNoteCounts).toEqual({ r25: 4 });
		expect((await listSeriesNotes(state.db, names, 'b')).entryNoteCounts).toEqual({ r25: 1 });
		expect((await listSeriesNotes(state.db, names, 'nobody')).entryNoteCounts).toEqual({});
	});
});

describe('傾向のメモ', () => {
	it('1人・1重賞につき1本で、書き直すと上書きになり、前後の空白は落ちる', async () => {
		await saveGradedRaceTrend(state.db, 'オールカマー', ' 内枠が残る ', 'a');
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toEqual({ body: '内枠が残る' });
		expect(await saveGradedRaceTrend(state.db, 'オールカマー', '外差しも届く', 'a')).toBe('saved');
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toEqual({
			body: '外差しも届く'
		});
		expect(state.sqlite.prepare('SELECT count(*) AS n FROM graded_race_note').get()).toEqual({
			n: 1
		});
	});

	it('別名の鍵で書いた傾向も読め、鍵の行があればそちらを優先する', async () => {
		await saveGradedRaceTrend(state.db, '産経賞オールカマー', '古い鍵の傾向', 'a');
		// 鍵ではなく別名で書いた行も、同じ重賞の傾向として読める。
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toEqual({
			body: '古い鍵の傾向'
		});
		// 別の別名の行が2つあれば、更新の新しいほう。
		state.sqlite.exec(
			`INSERT INTO graded_race_note (user_id, race_key, body, updated_at) VALUES ('a','オールカマー','鍵の傾向', 1)`
		);
		state.sqlite.exec(
			`UPDATE graded_race_note SET updated_at = 2 WHERE race_key = '産経賞オールカマー'`
		);
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toEqual({ body: '鍵の傾向' });
		// 他人の行は読まない。
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'b')).toBeNull();
	});

	it('鍵で保存すると別名の行は消える。空で保存すると別名も全部消える。他人の行は残る', async () => {
		state.sqlite.exec(`
			INSERT INTO graded_race_note (user_id, race_key, body) VALUES
				('a','産経賞オールカマー','古い鍵'), ('a','ローズS','別の重賞'), ('b','産経賞オールカマー','b の古い鍵');
		`);
		await saveGradedRaceTrend(state.db, 'オールカマー', '新しい傾向', 'a');
		const rows = () =>
			state.sqlite
				.prepare('SELECT user_id, race_key, body FROM graded_race_note ORDER BY user_id, race_key')
				.all();
		expect(rows()).toEqual([
			{ user_id: 'a', race_key: 'オールカマー', body: '新しい傾向' },
			{ user_id: 'a', race_key: 'ローズS', body: '別の重賞' },
			{ user_id: 'b', race_key: '産経賞オールカマー', body: 'b の古い鍵' }
		]);

		state.sqlite.exec(
			`INSERT INTO graded_race_note (user_id, race_key, body) VALUES ('a','産経賞オールカマー','また古い鍵')`
		);
		expect(await saveGradedRaceTrend(state.db, 'オールカマー', '', 'a')).toBe('cleared');
		expect(rows().map((r) => `${r.user_id}:${r.race_key}`)).toEqual([
			'a:ローズS',
			'b:産経賞オールカマー'
		]);
	});

	it('空で保存すると消える', async () => {
		await saveGradedRaceTrend(state.db, 'オールカマー', '内枠が残る', 'a');
		expect(await saveGradedRaceTrend(state.db, 'オールカマー', '  ', 'a')).toBe('cleared');
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toBeNull();
	});

	it('他人の傾向は読めず、自分の傾向を消しても他人のものは残る', async () => {
		await saveGradedRaceTrend(state.db, 'オールカマー', 'a の傾向', 'a');
		await saveGradedRaceTrend(state.db, 'オールカマー', 'b の傾向', 'b');
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'a')).toEqual({ body: 'a の傾向' });
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'b')).toEqual({ body: 'b の傾向' });
		expect(await listGradedRaceTrendKeys(state.db, 'a')).toEqual(['オールカマー']);
		expect(await listGradedRaceTrendKeys(state.db, 'nobody')).toEqual([]);

		await saveGradedRaceTrend(state.db, 'オールカマー', '', 'a');
		expect(await getGradedRaceTrend(state.db, 'オールカマー', 'b')).toEqual({ body: 'b の傾向' });
	});
});

const seriesRace = (id: string, date: string, grade: SeriesRace['grade']): SeriesRace =>
	({ id, date, course: '中山', raceNumber: 11, name: 'オールカマー', grade }) as SeriesRace;

describe('重賞のタイムライン', () => {
	const races = [
		seriesRace('r24', '2024-09-22', 'G3'),
		seriesRace('r26', '2026-09-27', 'G2'),
		seriesRace('r25', '2025-09-28', 'G2')
	];
	const notes: SeriesNote[] = [
		{ id: 'n1', kind: 'race_preview', raceId: 'r25', body: '見立て', tags: [], pace: 'ハイ' },
		{ id: 'n2', kind: 'race', raceId: 'r25', body: 'ふりかえり', tags: ['不利'], pace: null }
	];
	const mark = (m: SeriesMark['mark'], horseNumber: number | null): SeriesMark => ({
		entryId: `e${m}${horseNumber}`,
		raceId: 'r25',
		mark: m,
		horseName: `馬${horseNumber}`,
		bracket: null,
		horseNumber,
		finishPosition: null
	});

	it('年の降順で、印は印の順・同じ印は馬番の昇順（馬番なしは後ろ）', () => {
		const marks = [mark('▲', 3), mark('◎', 9), mark('▲', null), mark('▲', 1), mark('◎', 2)];
		const timeline = buildGradedRaceTimeline(races, notes, marks, '2026-09-20');
		expect(timeline.map((y) => y.year)).toEqual(['2026', '2025', '2024']);

		const y25 = timeline[1].races[0];
		expect(y25.marks.map((m) => m.horseName)).toEqual(['馬2', '馬9', '馬1', '馬3', '馬null']);
		expect(y25.preview).toEqual({ body: '見立て', pace: 'ハイ' });
		expect(y25.review).toEqual({ body: 'ふりかえり', tags: ['不利'] });
		expect(y25.entryNoteCount).toBe(0);
		// メモの無い年もレースの行は残る。
		expect(timeline[2].races[0]).toMatchObject({ preview: null, review: null, marks: [] });
	});

	it('1頭ごとのメモの件数はレースごとに付く', () => {
		const timeline = buildGradedRaceTimeline(races, [], [], '2026-09-20', { r25: 3 });
		expect(timeline.map((y) => y.races[0].entryNoteCount)).toEqual([0, 3, 0]);
	});

	it('当日のレースは予定にしない（翌日以降だけが予定）', () => {
		const one = [seriesRace('r26', '2026-09-27', 'G2')];
		expect(buildGradedRaceTimeline(one, [], [], '2026-09-26')[0].races[0].upcoming).toBe(true);
		expect(buildGradedRaceTimeline(one, [], [], '2026-09-27')[0].races[0].upcoming).toBe(false);
	});
});

describe('見出しの格', () => {
	it('今年のレースがあれば今年の格（過去の年の格に関わらない）', () => {
		const races = [seriesRace('r26', '2026-09-27', 'G2'), seriesRace('r25', '2025-09-28', 'G3')];
		expect(currentGrade(races, '2026')).toMatchObject({
			grade: 'G2',
			year: '2026',
			isThisYear: true
		});
	});

	it('今年のレースが無ければ、いちばん新しい重賞の年の格', () => {
		const races = [seriesRace('r24', '2024-09-22', 'G3'), seriesRace('r25', '2025-09-28', 'G2')];
		expect(currentGrade(races, '2026')).toMatchObject({
			grade: 'G2',
			year: '2025',
			isThisYear: false
		});
	});

	it('G1〜G3 が1つも無ければ null（重賞ではない）', () => {
		expect(currentGrade([seriesRace('x', '2026-05-02', 'OP')], '2026')).toBeNull();
		expect(currentGrade([], '2026')).toBeNull();
	});
});
