/**
 * data/races/*.yaml を読んで、D1 に流す SQL を組み立てる。
 *
 * 出走馬の登録は画面からではなく**リポジトリのデータファイル経由**で行う。
 * 予想に使うには金曜の時点で出馬表が入っている必要があり、16頭を手で打つのは
 * 現実的でないため。人でも AI でも、PR を出せば同じ経路で入る。
 *
 * 生成する SQL は**冪等**で、メモ（note）には一切触れない。
 * 同じファイルを何度流しても結果は同じで、既存のメモは消えない。
 *
 *   node --experimental-strip-types scripts/import-races.ts --out out.sql
 *   node --experimental-strip-types scripts/import-races.ts --check
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import * as v from 'valibot';
import {
	COURSES,
	DIRECTIONS,
	GRADES,
	SURFACES,
	TRACK_CONDITIONS
} from '../src/lib/schemas/race.ts';

const DATA_DIR = 'data/races';

const optional = <T extends readonly string[]>(options: T) =>
	v.optional(v.picklist(options as unknown as string[]));

const entrySchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, '馬名は必須です')),
	bracket: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(8))),
	horseNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(18))),
	jockey: v.optional(v.string()),
	sex: optional(['牡', '牝', 'セ'] as const),
	birthYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1980), v.maxValue(2100))),
	trainer: v.optional(v.string()),
	sire: v.optional(v.string()),
	dam: v.optional(v.string())
});

const raceSchema = v.object({
	course: v.picklist(COURSES as unknown as string[], '競馬場は JRA の10場のみ'),
	raceNumber: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)),
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'レース名は必須です')),
	grade: optional(GRADES),
	className: v.optional(v.string()),
	surface: optional(SURFACES),
	distance: v.optional(v.pipe(v.number(), v.integer(), v.minValue(800), v.maxValue(5000))),
	direction: optional(DIRECTIONS),
	trackCondition: optional(TRACK_CONDITIONS),
	weather: v.optional(v.string()),
	entries: v.pipe(v.array(entrySchema), v.maxLength(18, '出走馬は18頭までです'))
});

const fileSchema = v.object({
	date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で書いてください')),
	races: v.array(raceSchema)
});

type RaceFile = v.InferOutput<typeof fileSchema>;

/** SQL リテラル。ここを通さない値は SQL に入れない。 */
function lit(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return 'NULL';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`数値が不正です: ${value}`);
		return String(value);
	}
	return `'${value.replace(/'/g, "''")}'`;
}

/**
 * ULID 相当の ID。乱数なので実行のたびに変わるが、
 * 生成した ID は「その行がまだ無いとき」にしか使われないので問題ない。
 */
function newId(): string {
	const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	const time = Date.now();
	let ts = '';
	for (let i = 9, t = time; i >= 0; i--, t = Math.floor(t / 32)) ts = ALPHABET[t % 32] + ts;
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return ts + Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
}

function statementsFor(file: RaceFile): string[] {
	const out: string[] = [];
	const { date } = file;

	for (const race of file.races) {
		/** レースの自然キー。`r.` を付けた版も使うので、接頭辞を引数にする。 */
		const raceKey = (prefix = '') =>
			`${prefix}date = ${lit(date)} AND ${prefix}course = ${lit(race.course)} AND ${prefix}race_number = ${lit(race.raceNumber)}`;

		out.push(
			`-- ${date} ${race.course}${race.raceNumber}R ${race.name}`,
			`INSERT INTO race (id, date, course, race_number, name, grade, class_name, surface, distance, direction, track_condition, weather)
VALUES (${lit(newId())}, ${lit(date)}, ${lit(race.course)}, ${lit(race.raceNumber)}, ${lit(race.name)}, ${lit(race.grade)}, ${lit(race.className)}, ${lit(race.surface)}, ${lit(race.distance)}, ${lit(race.direction)}, ${lit(race.trackCondition)}, ${lit(race.weather)})
ON CONFLICT (date, course, race_number) DO UPDATE SET
  name = excluded.name, grade = excluded.grade, class_name = excluded.class_name,
  surface = excluded.surface, distance = excluded.distance, direction = excluded.direction,
  track_condition = excluded.track_condition, weather = excluded.weather,
  updated_at = unixepoch();`
		);

		for (const e of race.entries) {
			// 馬は名前で引き当てる。無ければ作る。
			// horse_name_birth は (name, birth_year) の UNIQUE だが、birth_year が NULL だと
			// SQLite は NULL 同士を別物として扱い ON CONFLICT が発火しない。
			// そのため ON CONFLICT ではなく WHERE NOT EXISTS で書く。
			out.push(
				`INSERT INTO horse (id, name, sex, birth_year, trainer, sire, dam)
SELECT ${lit(newId())}, ${lit(e.name)}, ${lit(e.sex)}, ${lit(e.birthYear)}, ${lit(e.trainer)}, ${lit(e.sire)}, ${lit(e.dam)}
WHERE NOT EXISTS (SELECT 1 FROM horse WHERE name = ${lit(e.name)});`,
				// 既存馬は属性だけ更新する。**プロフィールメモには触らない**（利用者が書いたもの）。
				`UPDATE horse SET
  sex = COALESCE(${lit(e.sex)}, sex),
  birth_year = COALESCE(${lit(e.birthYear)}, birth_year),
  trainer = COALESCE(${lit(e.trainer)}, trainer),
  sire = COALESCE(${lit(e.sire)}, sire),
  dam = COALESCE(${lit(e.dam)}, dam),
  updated_at = unixepoch()
WHERE name = ${lit(e.name)};`,
				// 出走馬は (race_id, horse_id) で upsert。**削除も再作成もしない**ので、
				// 紐づくメモが ON DELETE CASCADE で道連れになることがない。
				`INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey)
SELECT ${lit(newId())}, r.id, h.id, ${lit(e.bracket)}, ${lit(e.horseNumber)}, ${lit(e.jockey)}
FROM race r, horse h
WHERE ${raceKey('r.')} AND h.name = ${lit(e.name)}
ON CONFLICT (race_id, horse_id) DO UPDATE SET
  bracket = excluded.bracket, horse_number = excluded.horse_number, jockey = excluded.jockey;`
			);
		}
	}

	return out;
}

async function main() {
	const args = process.argv.slice(2);
	const checkOnly = args.includes('--check');
	const outIndex = args.indexOf('--out');
	const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

	let files: string[];
	try {
		files = (await readdir(DATA_DIR)).filter((f) => /\.ya?ml$/.test(f)).sort();
	} catch {
		console.error(`${DATA_DIR} がありません。`);
		process.exit(1);
	}

	if (files.length === 0) {
		console.error(`${DATA_DIR} に .yaml がありません。`);
		process.exit(1);
	}

	const statements: string[] = [];
	let raceCount = 0;
	let entryCount = 0;
	let failed = false;

	for (const f of files) {
		const raw = await readFile(join(DATA_DIR, f), 'utf8');
		const parsed = v.safeParse(fileSchema, parse(raw));

		if (!parsed.success) {
			failed = true;
			console.error(`✗ ${f}`);
			for (const issue of parsed.issues) {
				const path = issue.path?.map((p) => String(p.key)).join('.') ?? '';
				console.error(`    ${path}: ${issue.message}`);
			}
			continue;
		}

		// ファイル名と中身の日付が食い違うと、どの週のデータか分からなくなる。
		const expected = f.replace(/\.ya?ml$/, '');
		if (expected !== parsed.output.date) {
			failed = true;
			console.error(`✗ ${f}: ファイル名と date（${parsed.output.date}）が一致しません`);
			continue;
		}

		raceCount += parsed.output.races.length;
		entryCount += parsed.output.races.reduce((n, r) => n + r.entries.length, 0);
		statements.push(...statementsFor(parsed.output));
		console.log(`✓ ${f}  レース ${parsed.output.races.length} / 出走馬 ${entryCount}`);
	}

	if (failed) process.exit(1);
	console.log(`\n合計: レース ${raceCount} / 出走馬 ${entryCount}`);

	if (checkOnly) return;

	const sql = statements.join('\n') + '\n';
	if (outPath) {
		await writeFile(outPath, sql, 'utf8');
		console.log(`SQL を書き出しました: ${outPath}`);
	} else {
		process.stdout.write(sql);
	}
}

await main();
