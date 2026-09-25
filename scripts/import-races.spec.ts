import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { readRaceFile, statementsFor } from './import-races.ts';

/**
 * 投入 SQL を、マイグレーションを流した SQLite に実際に流して確かめる。
 * D1 も中身は SQLite なので、CHECK・UNIQUE・CASCADE はここで本番と同じに効く。
 */
function freshDb(): DatabaseSync {
	// drizzle の生成した 0008 は、古い note に無い列を "tags" と書いて SELECT している。
	// D1 はダブルクォートを文字列として読むので通る。同じ扱いにしないと流せない。
	const db = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
	db.exec('PRAGMA foreign_keys = ON');
	const dir = 'drizzle';
	for (const f of readdirSync(dir)
		.filter((f) => f.endsWith('.sql'))
		.sort()) {
		for (const stmt of readFileSync(join(dir, f), 'utf8').split('--> statement-breakpoint')) {
			if (stmt.trim()) db.exec(stmt);
		}
	}
	db.exec(`INSERT INTO user (id, google_sub, email, display_name, role) VALUES
		('U1', 'sub1', 'u1@example.invalid', 'U1', 'user'),
		('U2', 'sub2', 'u2@example.invalid', 'U2', 'user')`);
	return db;
}

function load(db: DatabaseSync, yaml: string) {
	const parsed = readRaceFile(yaml, '2099-01-04.yaml');
	if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
	db.exec(statementsFor(parsed.output, '2099-01-04.yaml', 'hash').join('\n'));
}

/** 馬の ref で出走馬行を引いて、その行にメモを置く。 */
function addNote(
	db: DatabaseSync,
	o: {
		id: string;
		author: string;
		ref: string;
		kind: string;
		body: string;
		mark?: string;
		tags?: string;
	}
) {
	db.prepare(
		`INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
		 SELECT ?, ?, ?, re.race_id, re.horse_id, re.id, ?, ?, ?, '2099-01-04'
		 FROM race_entry re JOIN horse h ON h.id = re.horse_id WHERE h.external_ref = ?`
	).run(o.id, o.author, o.kind, o.body, o.tags ?? '[]', o.mark ?? null, o.ref);
}

const candidates = `date: 2099-01-04
races:
  - course: 中山
    raceNumber: 11
    name: テストS
    entries:
      - { name: ホースA, ref: t-a }
      - { name: ホースB, ref: t-b }
      - { name: ホースC, ref: t-c }
`;

const confirmed = `date: 2099-01-04
races:
  - course: 中山
    raceNumber: 11
    name: テストS
    entries:
      - { horseNumber: 1, bracket: 1, name: ホースA, ref: t-a }
      - { horseNumber: 2, bracket: 2, name: ホースC, ref: t-c }
    withdrawn:
      - { name: ホースB, ref: t-b }
`;

describe('取り下げ（withdrawn）', () => {
	let db: DatabaseSync;

	beforeEach(() => {
		db = freshDb();
		load(db, candidates);
		addNote(db, {
			id: 'N_PREVIEW',
			author: 'U1',
			ref: 't-b',
			kind: 'preview',
			body: '距離短縮で',
			mark: '◎'
		});
		addNote(db, {
			id: 'N_MARKONLY',
			author: 'U2',
			ref: 't-b',
			kind: 'preview',
			body: '',
			mark: '△'
		});
		addNote(db, {
			id: 'N_ENTRY',
			author: 'U1',
			ref: 't-b',
			kind: 'entry',
			body: 'ふりかえり',
			tags: '["次走買い"]'
		});
		addNote(db, {
			id: 'N_OTHER',
			author: 'U1',
			ref: 't-a',
			kind: 'preview',
			body: 'Aのメモ',
			mark: '○'
		});
	});

	const notes = () =>
		db
			.prepare(
				`SELECT n.id, n.kind, n.race_id, n.race_entry_id, n.mark, n.tags, n.body, n.occurred_at, h.external_ref AS ref
				 FROM note n JOIN horse h ON h.id = n.horse_id ORDER BY n.id`
			)
			.all();
	const entries = () =>
		db
			.prepare(
				`SELECT h.external_ref AS ref, re.horse_number AS no FROM race_entry re
				 JOIN horse h ON h.id = re.horse_id ORDER BY re.horse_number`
			)
			.all();

	it('出走馬行を消し、付いていたメモは近況メモに移して本文にレースと印を残す', () => {
		load(db, confirmed);

		expect(entries()).toEqual([
			{ ref: 't-a', no: 1 },
			{ ref: 't-c', no: 2 }
		]);
		const where = '（2099-01-04 中山11R テストS に出走しなかったため、';
		expect(notes()).toEqual([
			{
				id: 'N_ENTRY',
				kind: 'horse',
				race_id: null,
				race_entry_id: null,
				mark: null,
				tags: '["次走買い"]',
				body: `${where}ふりかえりから移しました）\n\nふりかえり`,
				occurred_at: '2099-01-04',
				ref: 't-b'
			},
			{
				id: 'N_MARKONLY',
				kind: 'horse',
				race_id: null,
				race_entry_id: null,
				mark: null,
				tags: '[]',
				body: `${where}出走前メモから移しました。印 △）`,
				occurred_at: '2099-01-04',
				ref: 't-b'
			},
			expect.objectContaining({
				id: 'N_OTHER',
				kind: 'preview',
				mark: '○',
				body: 'Aのメモ',
				ref: 't-a'
			}),
			expect.objectContaining({
				id: 'N_PREVIEW',
				kind: 'horse',
				mark: null,
				body: `${where}出走前メモから移しました。印 ◎）\n\n距離短縮で`
			})
		]);
	});

	it('2回流しても前置きは重ならない（冪等）', () => {
		load(db, confirmed);
		const once = notes();
		load(db, confirmed);
		expect(notes()).toEqual(once);
	});

	it('出走馬行に紐づくメモは CASCADE で消えない（移さなかった場合との対照）', () => {
		load(db, confirmed);
		expect(db.prepare(`SELECT count(*) AS n FROM note`).get()).toEqual({ n: 4 });
	});
});

describe('data:check の検証', () => {
	const errorsOf = (yaml: string) => {
		const r = readRaceFile(yaml, '2099-01-04.yaml');
		return r.ok ? [] : r.errors;
	};

	it('同じ馬が entries と withdrawn の両方にいたら落とす', () => {
		expect(
			errorsOf(confirmed.replace('{ name: ホースB, ref: t-b }', '{ name: ホースA, ref: t-a }'))
		).toEqual([
			'中山11R: ホースA が entries と withdrawn の両方にいます。出走するなら withdrawn から外してください'
		]);
	});

	it('馬番の重複を落とす', () => {
		expect(errorsOf(confirmed.replace('horseNumber: 2', 'horseNumber: 1'))).toEqual([
			'中山11R: 馬番 1 が ホースA と ホースC で重複しています'
		]);
	});

	it('馬番・着順が頭数を超えていたら落とす', () => {
		const withSize = (n: number) =>
			confirmed.replace('name: テストS', `name: テストS\n    fieldSize: ${n}`);
		expect(errorsOf(withSize(2))).toEqual([]);
		expect(errorsOf(withSize(1))).toEqual([
			'中山11R: ホースC の馬番・着順 2 が頭数 1 を超えています'
		]);
	});

	it('枠が決まる前の候補は18頭を超えてよい', () => {
		const many = Array.from({ length: 21 }, (_, i) => `      - { name: 候補${i + 1} }`).join('\n');
		expect(errorsOf(candidates.replace(/entries:[\s\S]*$/, `entries:\n${many}\n`))).toEqual([]);
	});
});

describe('レースの ref と発走時刻（オッズの取得対象）', () => {
	// 2099-01-04 中山（06）11R
	const withRef = candidates.replace(
		'name: テストS',
		'name: テストS\n    ref: nk-209906010111\n    startTime: "15:40"'
	);
	const errorsOf = (yaml: string) => {
		const r = readRaceFile(yaml, '2099-01-04.yaml');
		return r.ok ? [] : r.errors;
	};
	const race = (db: DatabaseSync) => db.prepare(`SELECT start_time, external_ref FROM race`).get();

	it('race の start_time と external_ref に入る', () => {
		const db = freshDb();
		load(db, withRef);
		expect(race(db)).toEqual({ start_time: '15:40', external_ref: 'nk-209906010111' });
	});

	it('書かなければ既存の値を残す（結果の欄と同じ）', () => {
		const db = freshDb();
		load(db, withRef);
		load(db, candidates);
		expect(race(db)).toEqual({ start_time: '15:40', external_ref: 'nk-209906010111' });
	});

	/**
	 * start_time はマイグレーション 0011 の列。main へのマージで走る本番への投入は
	 * マイグレーションを流さないので、リリースまでの間は列が無い。書いていない YAML で
	 * 列を名指しすると、その間の投入がすべて落ちる。
	 */
	it('書いていない YAML の SQL は start_time / external_ref を名指ししない', () => {
		const parsed = readRaceFile(candidates, '2099-01-04.yaml');
		if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
		const sql = statementsFor(parsed.output, '2099-01-04.yaml', 'hash').join('\n');
		expect(sql).not.toMatch(/start_time|external_ref = excluded/);
	});

	it('書いていない YAML の SQL は field_size も名指ししない（マイグレーション 0012 の列）', () => {
		const parsed = readRaceFile(candidates, '2099-01-04.yaml');
		if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
		expect(statementsFor(parsed.output, '2099-01-04.yaml', 'hash').join('\n')).not.toMatch(
			/field_size/
		);
	});

	it('発走時刻は HH:MM', () => {
		expect(errorsOf(withRef.replace('"15:40"', '"15時40分"'))).toEqual([
			'races.0.startTime: 発走時刻は HH:MM で書いてください'
		]);
	});

	it('netkeiba の race_id の年・場・R がレースと食い違えば落とす', () => {
		expect(errorsOf(withRef.replace('nk-209906010111', 'nk-209909010111'))).toEqual([
			'中山11R: ref nk-209909010111 の年・場・R がこのレースと合いません'
		]);
		expect(errorsOf(withRef.replace('nk-209906010111', 'nk-209906010110'))).toEqual([
			'中山11R: ref nk-209906010110 の年・場・R がこのレースと合いません'
		]);
		expect(errorsOf(withRef.replace('nk-209906010111', 'nk-2099'))).toEqual([
			'中山11R: ref nk-2099 は nk- に12桁の race_id ではありません'
		]);
	});
});

describe('レースの頭数（fieldSize）', () => {
	const withSize = candidates.replace('name: テストS', 'name: テストS\n    fieldSize: 16');
	const size = (db: DatabaseSync) => db.prepare(`SELECT field_size FROM race`).get();

	it('race の field_size に入り、書かなければ既存の値を残す', () => {
		const db = freshDb();
		load(db, withSize);
		expect(size(db)).toEqual({ field_size: 16 });
		load(db, candidates);
		expect(size(db)).toEqual({ field_size: 16 });
	});
});
