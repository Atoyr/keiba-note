import { describe, expect, it } from 'vitest';
import {
	applyPastRuns,
	applyProfile,
	applyResult,
	applyRaceRef,
	applyShutuba,
	fieldSizeOf,
	timeDiffs,
	isShutubaConfirmed,
	type ResolvePerson
} from './apply.ts';
import type { PastRun, Person, ResultRow, ShutubaRow } from './netkeiba.ts';
import { RaceFile } from './yaml-file.ts';

describe('isShutubaConfirmed', () => {
	// 金曜の定期取得（--require-confirmed）は、これが偽なら何も書かない。取り違えると枠順の前の出馬表で PR ができる
	it('馬番が1頭も無ければ枠順の前、1頭でもあれば確定', () => {
		expect(isShutubaConfirmed([{}, {}])).toBe(false);
		expect(isShutubaConfirmed([])).toBe(false);
		expect(isShutubaConfirmed([{ horseNumber: 1 }, {}])).toBe(true);
	});
});

const resolve: ResolvePerson = async (kind, p) =>
	`${p.short}（${kind === 'jockey' ? '騎' : '調'}）`;

const meta = {
	name: 'スプリンターズS',
	grade: 'G1' as const,
	surface: '芝' as const,
	distance: 1200
};

/** 枠の申し送り用に先に置いてあるレース（entries: []）。 */
const placeholder = `# 2026年9月27日（日） 芝重賞
# 申し送り用の枠だけ先に置く。
date: 2026-09-27

races:
  - course: 中山
    raceNumber: 11
    name: スプリンターズS
    grade: G1
    surface: 芝
    distance: 1200
    direction: 右
    entries: []
`;

const row = (id: string, name: string, extra: Partial<ShutubaRow> = {}): ShutubaRow => ({
	name,
	horseId: id,
	sex: '牡',
	age: 4,
	weight: 58,
	jockey: { id: `j${id}`, short: `騎${id}` },
	trainer: { id: `t${id}`, short: `調${id}` },
	trainingCenter: '美浦',
	...extra
});

describe('applyShutuba', () => {
	it('枠が決まる前は登録馬を候補として足す。コメントとレースの値は残す', async () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		const log = await applyShutuba(
			file,
			'中山',
			11,
			{ meta, rows: [row('1', 'ホースA'), row('2', 'ホースB')] },
			resolve
		);

		expect(log[0]).toBe('枠順未確定: 登録馬 2頭を候補として入れます');
		expect(file.changed).toBe(true);
		const out = file.toString();
		expect(out).toContain('# 申し送り用の枠だけ先に置く。');
		expect(out).toContain('    direction: 右\n    entries:\n      - name: ホースA\n');
		expect(out).toContain(
			[
				'      - name: ホースB',
				'        jockey: 騎2（騎）',
				'        sex: 牡',
				'        age: 4',
				'        ref: nk-2',
				'        trainer: 調2（調）',
				'        trainingCenter: 美浦',
				'        weight: 58'
			].join('\n')
		);
		expect(out).not.toContain('horseNumber');
	});

	it('枠が決まったら枠・馬番を入れ、出馬表にいない候補を withdrawn に移す', async () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		await applyShutuba(
			file,
			'中山',
			11,
			{ meta, rows: [row('1', 'ホースA'), row('2', 'ホースB'), row('3', 'ホースC')] },
			resolve
		);
		const log = await applyShutuba(
			file,
			'中山',
			11,
			{
				meta,
				rows: [
					row('3', 'ホースC', { bracket: 1, horseNumber: 1 }),
					row('1', 'ホースA', { bracket: 2, horseNumber: 2 })
				]
			},
			resolve
		);

		expect(log).toContain('- ホースB（出馬表に無いので withdrawn へ）');
		const race = file.findRace('中山', 11)!;
		expect(file.entries(race).items.map((e) => [e.get('horseNumber'), e.get('name')])).toEqual([
			[1, 'ホースC'],
			[2, 'ホースA']
		]);
		expect(file.toString()).toContain('    withdrawn:\n      - name: ホースB\n        ref: nk-2\n');
	});

	it('取り下げた馬が出馬表に戻ったら withdrawn から外す', async () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries: []\n    withdrawn:\n      - name: ホースB\n        ref: nk-2'
			)
		);
		const log = await applyShutuba(
			file,
			'中山',
			11,
			{ meta, rows: [row('2', 'ホースB')] },
			resolve
		);
		expect(log).toContain('↺ ホースB: 取り下げから戻しました');
		expect(file.toString()).not.toContain('withdrawn');
	});

	it('名前だけで書いた行に ref を足す。馬名は書き換えない', async () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースＡ\n      - name: ホースB'
			)
		);
		const log = await applyShutuba(
			file,
			'中山',
			11,
			{ meta, rows: [row('2', 'ホースB'), row('9', 'ホースＡ')] },
			resolve
		);
		const race = file.findRace('中山', 11)!;
		expect(file.entries(race).items.map((e) => [e.get('name'), e.get('ref')])).toEqual([
			['ホースB', 'nk-2'],
			['ホースＡ', 'nk-9']
		]);
		expect(log.filter((l) => l.startsWith('+'))).toEqual([]);
	});

	it('YAML に無いレースは作る', async () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		await applyShutuba(
			file,
			'阪神',
			11,
			{ meta: { name: 'ポートアイランドS', grade: 'L' }, rows: [row('1', 'ホースA')] },
			resolve
		);
		expect(file.toString()).toContain(
			'  - course: 阪神\n    raceNumber: 11\n    name: ポートアイランドS\n    grade: L\n    entries:\n'
		);
	});
});

describe('applyPastRuns', () => {
	const run = (date: string, extra: Partial<PastRun> = {}): PastRun => ({
		date,
		course: '中京',
		raceNumber: 7,
		race: {
			name: 'CBC賞',
			grade: 'G3',
			surface: '芝',
			distance: 1200,
			direction: '左',
			trackCondition: '良',
			weather: '晴',
			fieldSize: 16,
			runnerUp: '2着馬Y'
		},
		bracket: 1,
		horseNumber: 2,
		finish: 1,
		popularity: 3,
		jockey: '中井裕二',
		weight: 55,
		time: '1:06.5',
		timeDiff: -0.2,
		passing: '3-3',
		last3f: 33.6,
		horseWeight: 512,
		horseWeightDiff: -6,
		odds: 10.2,
		...extra
	});

	it('対象のレースより前の走りを、取消を飛ばして指定の数だけ入れる', async () => {
		const files = new Map<string, RaceFile>();
		const open = async (date: string) => {
			if (!files.has(date))
				files.set(date, RaceFile.parse(`${date}.yaml`, `date: ${date}\n\nraces: []\n`));
			return files.get(date)!;
		};
		const log = await applyPastRuns(
			open,
			{ name: 'ホースA', ref: 'nk-1' },
			[
				run('2026-09-27'),
				run('2026-08-09'),
				run('2026-07-05', { finish: undefined, status: '取' }),
				run('2026-06-01'),
				run('2026-05-01')
			],
			{ before: '2026-09-27', count: 2 }
		);

		expect([...files.keys()]).toEqual(['2026-08-09', '2026-06-01']);
		expect(log).toEqual(['+ 2026-08-09 中京7R CBC賞 1着', '+ 2026-06-01 中京7R CBC賞 1着']);
		expect(files.get('2026-08-09')!.toString()).toBe(`date: 2026-08-09

races:
  - course: 中京
    raceNumber: 7
    name: CBC賞
    grade: G3
    surface: 芝
    distance: 1200
    direction: 左
    trackCondition: 良
    weather: 晴
    fieldSize: 16
    winner: ホースA
    runnerUp: 2着馬Y
    entries:
      - horseNumber: 2
        bracket: 1
        name: ホースA
        jockey: 中井裕二
        ref: nk-1
        finish: 1
        popularity: 3
        time: "1:06.5"
        timeDiff: -0.2
        passing: "3-3"
        last3f: 33.6
        weight: 55
        horseWeight: 512
        horseWeightDiff: -6
        odds: 10.2
`);
	});

	it('既にあるレースには馬番順に足し、書いてある値とレース名は書き換えない', async () => {
		const file = RaceFile.parse(
			'2026-08-09.yaml',
			`date: 2026-08-09

races:
  - course: 中京
    raceNumber: 7
    name: ＣＢＣ賞 # 手で書いた名前
    entries:
      - horseNumber: 5
        name: ホースB
      - horseNumber: 1
        name: ホースA
        ref: nk-1
        finish: 2 # 降着後の着順
`
		);
		await applyPastRuns(
			async () => file,
			{ name: 'ホースA', ref: 'nk-1' },
			[run('2026-08-09', { horseNumber: 1 })],
			{ before: '2026-09-27', count: 5 }
		);
		await applyPastRuns(
			async () => file,
			{ name: 'ホースC', ref: 'nk-3' },
			[run('2026-08-09', { horseNumber: 3 })],
			{ before: '2026-09-27', count: 5 }
		);
		const out = file.toString();
		expect(out).toContain('    name: ＣＢＣ賞 # 手で書いた名前');
		expect(out).toContain('        finish: 2 # 降着後の着順');
		const race = file.findRace('中京', 7)!;
		expect(file.entries(race).items.map((e) => e.get('name'))).toEqual([
			'ホースA',
			'ホースC',
			'ホースB'
		]);
	});

	it('騎手は ID から略さない名前に引き直す', async () => {
		const file = RaceFile.parse('2026-08-09.yaml', 'date: 2026-08-09\n\nraces: []\n');
		const asked: Person[] = [];
		await applyPastRuns(
			async () => file,
			{ name: 'ホースA', ref: 'nk-1' },
			[run('2026-08-09', { jockey: '佐々木大', jockeyId: '01197' })],
			{ before: '2026-09-27', count: 5 },
			async (_kind, p) => {
				asked.push(p);
				return '佐々木大輔';
			}
		);
		expect(asked).toEqual([{ id: '01197', short: '佐々木大' }]);
		expect(file.toString()).toContain('        jockey: 佐々木大輔\n');
	});
});

describe('applyProfile', () => {
	it('性・馬齢・生年月日・調教師・血統を上書きする。馬齢はレースの年で数える', () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースA\n        sex: 牡\n        ref: nk-1\n        trainer: 前の厩舎'
			)
		);
		const race = file.findRace('中山', 11)!;
		const log = applyProfile(
			file,
			race,
			file.entries(race).items[0],
			{
				name: 'ホースA',
				sex: 'セ',
				birthYear: 2021,
				birthDate: '2021-04-04',
				trainer: '転厩先',
				trainingCenter: '栗東',
				sire: '父',
				dam: '母',
				damSire: '母父'
			},
			2026
		);
		expect(log).toEqual(['~ ホースA']);
		expect(file.toString()).toContain(
			'      - name: ホースA\n        sex: セ\n        age: 5\n        birthDate: 2021-04-04\n        ref: nk-1\n        trainer: 転厩先\n        trainingCenter: 栗東\n        sire: 父\n        dam: 母\n        damSire: 母父\n'
		);
	});
});

describe('applyResult', () => {
	const result = (id: string, name: string, extra: Partial<ResultRow> = {}): ResultRow => ({
		name,
		horseId: id,
		bracket: 1,
		horseNumber: 1,
		finish: 1,
		jockey: { id: 'j', short: '騎' },
		time: '1:07.0',
		popularity: 1,
		odds: 2.5,
		last3f: 33.5,
		passing: '2-2',
		weight: 58,
		horseWeight: 500,
		horseWeightDiff: 0,
		...extra
	});

	it('頭数は取消・除外を数えず、中止・失格は数える', () => {
		expect(
			fieldSizeOf([{}, { status: '中' }, { status: '失' }, { status: '取' }, { status: '除' }])
		).toBe(3);
		expect(fieldSizeOf([])).toBeUndefined();
	});

	it('タイム差は勝ち馬との差。勝ち馬は2着以下で最も速い馬との差を負で持つ', () => {
		const rows = [
			result('1', 'A', { finish: 1, time: '1:58.4' }),
			result('2', 'B', { finish: 2, time: '1:58.6' }),
			result('3', 'C', { finish: 3, time: '1:59.1' }),
			result('4', 'D', { finish: undefined, status: '取', time: undefined })
		];
		const diffs = timeDiffs(rows);
		expect(rows.map((r) => diffs.get(r))).toEqual([-0.2, 0.2, 0.7, undefined]);
	});

	it('1着同着なら、もう1頭の1着馬を2着馬に書く', async () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースA\n        ref: nk-1'
			)
		);
		const race = file.findRace('中山', 11)!;
		await applyResult(
			file,
			race,
			{
				meta,
				rows: [
					result('1', 'ホースA', { finish: 1 }),
					result('2', 'ホースB', { finish: 1 }),
					result('3', 'ホースC', { finish: 3 })
				]
			},
			resolve
		);
		expect(file.toString()).toContain('    winner: ホースA\n    runnerUp: ホースB\n');
	});

	it('ラップは1行の並びで書き、同じ値なら書き換えない。表が無ければ既存を消さない', async () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースA\n        ref: nk-1'
			)
		);
		const race = file.findRace('中山', 11)!;
		const rows = [result('1', 'ホースA', { finish: 1 })];
		await applyResult(file, race, { meta: { ...meta, laps: [12.3, 11.0, 13] }, rows }, resolve);
		// Prettier と同じ書き方（括弧の内側に空白を入れない）。
		expect(file.toString()).toContain('    laps: [12.3, 11, 13]\n');

		const before = file.toString();
		await applyResult(file, race, { meta: { ...meta, laps: [12.3, 11.0, 13] }, rows }, resolve);
		await applyResult(file, race, { meta: { ...meta, laps: undefined }, rows }, resolve);
		expect(file.toString()).toBe(before);
	});

	it('降着で着順とタイムの順が食い違っても、負は勝ち馬だけ', () => {
		const rows = [
			result('1', 'A', { finish: 1, time: '1:58.5' }),
			result('2', 'B', { finish: 2, time: '1:58.6' }),
			// 1:58.4 で入線して4着に降着
			result('4', 'D', { finish: 4, time: '1:58.4' })
		];
		const diffs = timeDiffs(rows);
		expect(rows.map((r) => diffs.get(r))).toEqual([-0.1, 0.1, 0]);

		// 2着馬のほうが速く入線していても、勝ち馬の差は正にしない
		const slowWinner = [
			result('1', 'A', { finish: 1, time: '1:58.7' }),
			result('2', 'B', { finish: 2, time: '1:58.6' })
		];
		const d2 = timeDiffs(slowWinner);
		expect(slowWinner.map((r) => d2.get(r))).toEqual([0, 0]);
	});

	it('同着の1着どうしは 0', () => {
		const rows = [
			result('1', 'A', { finish: 1, time: '1:08.0' }),
			result('2', 'B', { finish: 1, time: '1:08.0' }),
			result('3', 'C', { finish: 3, time: '1:08.3' })
		];
		const diffs = timeDiffs(rows);
		expect(rows.map((r) => diffs.get(r))).toEqual([0, 0, 0.3]);
	});

	it('YAML にいる馬だけ結果を入れ、馬場・天候・頭数・勝ち馬・2着馬も入れる', async () => {
		const file = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - horseNumber: 2\n        name: ホースA\n        ref: nk-1\n      - horseNumber: 1\n        name: ホースB'
			)
		);
		const race = file.findRace('中山', 11)!;
		const log = await applyResult(
			file,
			race,
			{
				meta: { ...meta, trackCondition: '稍重', weather: '曇' },
				rows: [
					result('2', 'ホースB', { horseNumber: 1, finish: 1 }),
					result('1', 'ホースA', { horseNumber: 2, finish: 2, margin: 'クビ' }),
					result('3', 'ホースC', { horseNumber: 3, finish: 3 })
				]
			},
			resolve
		);

		expect(log).toEqual([
			' 2着 ホースA',
			' 1着 ホースB',
			'（YAML に無い 1 頭は足していません: ホースC）'
		]);
		const out = file.toString();
		expect(out).toContain(
			'    trackCondition: 稍重\n    weather: 曇\n    fieldSize: 3\n    winner: ホースB\n    runnerUp: ホースA\n'
		);
		expect(out).toContain(
			'        name: ホースB\n        jockey: 騎（騎）\n        ref: nk-2\n        finish: 1\n'
		);
		expect(out).toContain('        margin: "クビ"\n');
		expect(out).not.toContain('ホースC');
	});
});

describe('applyRaceRef', () => {
	it('レースに netkeiba の race_id と発走時刻を書く（オッズの取得対象になる）', () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		const log = applyRaceRef(file, '中山', 11, '202606040911', { ...meta, startTime: '15:40' });

		expect(log).toEqual(['ref nk-202606040911 / 発走 15:40']);
		expect(file.toString()).toContain(
			// 時刻は YAML 1.1 だと60進数の整数に読まれうるので、クォートして書く
			'    direction: 右\n    ref: nk-202606040911\n    startTime: "15:40"\n    entries: []\n'
		);
	});

	it('発走時刻が読めなければそう伝える', () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		expect(applyRaceRef(file, '中山', 11, '202606040911', meta)).toEqual([
			'ref nk-202606040911（発走時刻が読めませんでした。オッズは取りに行きません）'
		]);
	});
});

describe('ブリンカーと騎手変更', () => {
	const confirmedYaml = (jockey: string, extra = '') =>
		placeholder.replace(
			'    entries: []',
			`    entries:\n      - horseNumber: 1\n        name: ホースA\n        jockey: ${jockey}\n${extra}        ref: nk-1`
		);
	const next = (jockey: string, extra: Partial<ShutubaRow> = {}) =>
		row('1', 'ホースA', {
			bracket: 1,
			horseNumber: 1,
			...extra,
			jockey: { id: 'jx', short: jockey }
		});
	const identity: ResolvePerson = async (_kind, p) => p.short;
	const run1 = async (file: RaceFile, r: ShutubaRow) =>
		applyShutuba(file, '中山', 11, { meta, rows: [r] }, identity);

	it('枠順確定の出馬表だけブリンカーを書く（着用・着用なしとも）。枠順前は書かない', async () => {
		const file = RaceFile.parse('2026-09-27.yaml', placeholder);
		await applyShutuba(
			file,
			'中山',
			11,
			{ meta, rows: [row('1', 'ホースA', { blinker: true })] },
			identity
		);
		expect(file.toString()).not.toContain('blinker');

		await run1(file, next('騎1', { blinker: false }));
		expect(file.toString()).toContain('        blinker: false\n');
		await run1(file, next('騎1', { blinker: true }));
		expect(file.toString()).toContain('        blinker: true\n');
		// 取れなかった（不明）ときは今の値を消さない
		await run1(file, next('騎1', { blinker: undefined }));
		expect(file.toString()).toContain('        blinker: true\n');
	});

	it('馬番のある行の騎手が変わったら、発表時の騎手を残す。再変更でも最初のまま', async () => {
		const file = RaceFile.parse('2026-09-27.yaml', confirmedYaml('川田将雅'));
		const log = await run1(file, next('戸崎圭太'));
		expect(log).toContain('! 騎手変更 ホースA: 川田将雅 → 戸崎圭太');
		expect(file.toString()).toContain(
			'        jockey: 戸崎圭太\n        announcedJockey: 川田将雅\n'
		);

		await run1(file, next('坂井瑠星'));
		expect(file.toString()).toContain(
			'        jockey: 坂井瑠星\n        announcedJockey: 川田将雅\n'
		);
	});

	it('騎手が同じ（略称を含む）・馬番がまだ無い行では検知しない', async () => {
		const same = RaceFile.parse('2026-09-27.yaml', confirmedYaml('川田将'));
		await run1(same, next('川田将雅'));
		expect(same.toString()).not.toContain('announcedJockey');

		const candidate = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースA\n        jockey: 川田将雅\n        ref: nk-1'
			)
		);
		await run1(candidate, next('戸崎圭太'));
		expect(candidate.toString()).not.toContain('announcedJockey');
	});

	it('結果でも、馬番のあった行の騎手が違えば発表時の騎手を残す。馬番の無い行は残さない', async () => {
		const result = (jockey: string): ResultRow => ({
			name: 'ホースA',
			horseId: '1',
			bracket: 1,
			horseNumber: 1,
			finish: 1,
			jockey: { id: 'jx', short: jockey }
		});
		const withNumber = RaceFile.parse('2026-09-27.yaml', confirmedYaml('川田将雅'));
		await applyResult(
			withNumber,
			withNumber.findRace('中山', 11)!,
			{ meta, rows: [result('戸崎圭太')] },
			identity
		);
		expect(withNumber.toString()).toContain('        announcedJockey: 川田将雅\n');

		const noNumber = RaceFile.parse(
			'2026-09-27.yaml',
			placeholder.replace(
				'    entries: []',
				'    entries:\n      - name: ホースA\n        jockey: 川田将雅\n        ref: nk-1'
			)
		);
		await applyResult(
			noNumber,
			noNumber.findRace('中山', 11)!,
			{ meta, rows: [result('戸崎圭太')] },
			identity
		);
		expect(noNumber.toString()).not.toContain('announcedJockey');
	});

	it('過去走は前走（取消を除いた最新）だけブリンカーを書き、既にある値は書き換えない', async () => {
		const files = new Map<string, RaceFile>();
		const open = async (date: string) => {
			if (!files.has(date))
				files.set(date, RaceFile.parse(`${date}.yaml`, `date: ${date}\n\nraces: []\n`));
			return files.get(date)!;
		};
		const base: Omit<PastRun, 'date'> = {
			course: '中京',
			raceNumber: 7,
			raceId: '202607040707',
			race: { name: 'CBC賞' },
			finish: 3
		};
		const asked: string[] = [];
		await applyPastRuns(
			open,
			{ name: 'ホースA', ref: 'nk-1' },
			[
				{ ...base, date: '2026-09-01', finish: undefined, status: '取', raceId: 'cancelled' },
				{ ...base, date: '2026-08-09', raceId: 'prev' },
				{ ...base, date: '2026-07-05', raceId: 'older' }
			],
			{
				before: '2026-09-27',
				count: 5,
				blinkerOf: async (r) => {
					asked.push(r.raceId!);
					return true;
				}
			}
		);
		expect(asked).toEqual(['prev']);
		expect(files.get('2026-08-09')!.toString()).toContain('        blinker: true\n');
		expect(files.get('2026-07-05')!.toString()).not.toContain('blinker');
	});

	it('前走の行にすでに blinker があれば、5走表示を取りに行かない', async () => {
		const file = RaceFile.parse(
			'2026-08-09.yaml',
			`date: 2026-08-09

races:
  - course: 中京
    raceNumber: 7
    name: CBC賞
    entries:
      - name: ホースA
        ref: nk-1
        blinker: false
`
		);
		let asked = 0;
		await applyPastRuns(
			async () => file,
			{ name: 'ホースA', ref: 'nk-1' },
			[
				{
					date: '2026-08-09',
					course: '中京',
					raceNumber: 7,
					raceId: 'prev',
					race: { name: 'CBC賞' },
					finish: 3
				}
			],
			{
				before: '2026-09-27',
				count: 5,
				blinkerOf: async () => {
					asked++;
					return true;
				}
			}
		);
		expect(asked).toBe(0);
		expect(file.toString()).toContain('blinker: false');
	});
});
