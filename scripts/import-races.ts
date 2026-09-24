/**
 * data/races/*.yaml を読んで、D1 に流す SQL を組み立てる。
 *
 * 出走馬の登録は画面からではなく**リポジトリのデータファイル経由**で行う。
 * 予想に使うには金曜の時点で出馬表が入っている必要があり、16頭を手で打つのは
 * 現実的でないため。人でも AI でも、PR を出せば同じ経路で入る。
 *
 * **レース後は同じファイルに結果を追記する。** 馬柱（予想画面に出す各馬の過去走）は
 * 過去のレースの race_entry がそのまま材料になるので、結果が入っていないと
 * 空欄の枠だけが並ぶ。出馬表と結果を同じ経路に載せておけば、蓄積が途切れない。
 *
 * **流すのは内容が変わったファイルだけ。** 開催日ごとにファイルが増える設計なので、
 * 毎回すべてを再適用すると「今週ぶんを入れるために過去1年を流し直す」ことになる。
 * 適用済みのハッシュは D1 の `data_import` に覚えてあり、突き合わせて差分を出す。
 *
 * 生成する SQL は**冪等**で、既存のメモは消えない。同じファイルを何度流しても結果は同じ。
 * メモ（note）に触れるのは取り下げ（`withdrawn`）のときだけで、それも消さずに
 * 近況メモへ移す（`withdrawStatements`）。
 *
 *   node --experimental-strip-types scripts/import-races.ts --check
 *   node --experimental-strip-types scripts/import-races.ts --target local  --out out.sql
 *   node --experimental-strip-types scripts/import-races.ts --target staging --out out.sql
 *   node --experimental-strip-types scripts/import-races.ts --target remote --out out.sql --all
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import * as v from 'valibot';
import {
	COURSES,
	DIRECTIONS,
	GRADES,
	MAX_ENTRIES,
	SURFACES,
	TRACK_CONDITIONS
} from '../src/lib/schemas/race.ts';

/**
 * 既定の投入元。**ここには本番に入れてよいデータだけを置く。**
 *
 * 架空のサンプルは `data/examples/` にあり、既定では読まれない。
 * マージのたびに GitHub Actions が `data:import:remote` を走らせるので、
 * 投入対象の場所にサンプルを置くと、そのまま本番に入ってしまう。
 * 手元でサンプルを流すときは `--dir data/examples` を付ける。
 */
const DEFAULT_DATA_DIR = 'data/races';
const WRANGLER = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB_NAME = 'k-note';

const optional = <T extends readonly string[]>(options: T) =>
	v.optional(v.picklist(options as unknown as string[]));

const entrySchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, '馬名は必須です')),
	/**
	 * 引き当て用の外部 ID（netkeiba の馬ID等）。**指定すればこれが最優先のキー**になり、
	 * 同名馬でも取り違えない。分かるなら書いておくのが一番強い。
	 */
	ref: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
	bracket: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(8))),
	horseNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(18))),
	jockey: v.optional(v.string()),
	sex: optional(['牡', '牝', 'セ'] as const),
	birthYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1980), v.maxValue(2100))),
	/**
	 * 馬齢。出馬表の「性齢」欄（牡4 の 4）をそのまま書ける。
	 * 生年は `開催年 - 馬齢` で導出する（2001年以降の満年齢表記）。
	 * `birthYear` を直接書いてもよく、両方書くなら一致していること。
	 */
	age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20))),
	trainer: v.optional(v.string()),
	sire: v.optional(v.string()),
	dam: v.optional(v.string()),

	// --- ここから下はレース後に追記する結果 --------------------------------
	// 書かなければ既存の値を消さない（COALESCE で埋める）。
	// 書けば上書きする。降着・失格の訂正が YAML から効くようにするため。
	/** 着順。除外・中止なら書かない。 */
	finish: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(18))),
	popularity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(18))),
	/** `2:11.4` のような文字列のまま持つ。秒に直すのは読む側の仕事。 */
	time: v.optional(v.string()),
	/** 着差。`クビ` `1.1/2` など競馬の表記をそのまま。 */
	margin: v.optional(v.string()),
	/** 通過順。`5-5-4-2`。 */
	passing: v.optional(v.string()),
	/** 上がり3F。 */
	last3f: v.optional(v.pipe(v.number(), v.minValue(20), v.maxValue(60))),
	/** 斤量。 */
	weight: v.optional(v.pipe(v.number(), v.minValue(40), v.maxValue(70))),
	/** 馬体重。 */
	horseWeight: v.optional(v.pipe(v.number(), v.integer(), v.minValue(300), v.maxValue(700))),
	/** 前走からの増減。`-4` のように負もある。 */
	horseWeightDiff: v.optional(v.pipe(v.number(), v.integer(), v.minValue(-50), v.maxValue(50))),
	odds: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(10000)))
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
	entries: v.pipe(
		v.array(entrySchema),
		v.maxLength(MAX_ENTRIES, `出走馬は${MAX_ENTRIES}頭までです`)
	),
	/**
	 * 取り下げる出走馬。**書いた馬の出走馬行を DB から消す。**
	 * 枠が決まって出走しなかった候補や、登録を回避した馬を書く。
	 *
	 * 付いていたメモは消さずに近況メモ（kind='horse'）へ移してから消す（`withdrawStatements`）。
	 * 引き当ては出走馬行と同じ `horseRef` なので、ref があれば書いておく。
	 */
	withdrawn: v.optional(
		v.array(
			v.object({
				name: v.pipe(v.string(), v.trim(), v.minLength(1, '馬名は必須です')),
				ref: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
			})
		)
	)
});

const fileSchema = v.object({
	date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で書いてください')),
	races: v.array(raceSchema)
});

type RaceFile = v.InferOutput<typeof fileSchema>;
type Entry = v.InferOutput<typeof entrySchema>;

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

/**
 * 馬の引き当て式。**必ず1行以下**に絞れるスカラーサブクエリを返す。
 *
 * この式を「作る／埋める／出走馬に紐づける」の3箇所で使い回すのが肝。
 * 3箇所で別々の条件を書くと、引き当てた馬と更新する馬が食い違う。
 *
 * **鍵は「後から足される」ことを前提にすること。** `ref` も生年も、
 * 名前だけで登録したあとに追記される。追記のたびに新しい行を作ってしまっては
 * 二段階で書ける意味がないので、どちらの条件も「まだ埋まっていない行」を拾う。
 *
 * 優先順位:
 *   1. `external_ref` が一致する馬
 *   2. **まだ ref の付いていない**同名馬（`ref` を後から足す経路）
 *   3. 生年が一致する同名馬 → 無ければ生年未設定の同名馬（`age` を後から足す経路）
 *   4. 名前だけなら同名の中から、生年未設定 → 生年が新しい順に1頭
 */
function horseRef(e: Pick<Entry, 'name' | 'ref' | 'birthYear'>): string {
	// 名前（＋分かれば生年）での引き当て条件。
	const byName = e.birthYear
		? `name = ${lit(e.name)} AND (birth_year = ${lit(e.birthYear)} OR birth_year IS NULL)`
		: `name = ${lit(e.name)}`;
	// 生年が分かるなら一致を先に。分からないなら生年未設定 → 新しい順。
	const order = e.birthYear ? 'birth_year IS NULL' : 'birth_year IS NULL DESC, birth_year DESC';

	if (!e.ref) {
		return `(SELECT id FROM horse WHERE ${byName} ORDER BY ${order} LIMIT 1)`;
	}

	// ref 一致を最優先しつつ、**ref がまだ無い同名馬**も拾う。
	// これが無いと、既にいる馬に ref を追記した瞬間に「ref 一致なし」で
	// もう1頭作ろうとし、horse_name_birth の UNIQUE に当たって落ちる。
	return (
		`(SELECT id FROM horse` +
		` WHERE external_ref = ${lit(e.ref)} OR (external_ref IS NULL AND ${byName})` +
		` ORDER BY external_ref IS NULL, ${order} LIMIT 1)`
	);
}

export function statementsFor(file: RaceFile, fileName: string, hash: string): string[] {
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
  updated_at = unixepoch();`,
			// 枠・馬番はいったん外してから入れ直す。
			// 確定後に訂正が入ると（2頭の馬番が入れ替わる等）、1頭ずつ更新する途中で
			// entry_race_number の UNIQUE (race_id, horse_number) に当たって実行ごと落ちる。
			// **このレースの枠・馬番については YAML が正**、という割り切り。
			`UPDATE race_entry SET bracket = NULL, horse_number = NULL
WHERE race_id = (SELECT id FROM race WHERE ${raceKey()});`
		);

		for (const w of race.withdrawn ?? []) {
			out.push(...withdrawStatements(date, race, w, raceKey()));
		}

		for (const e of race.entries) {
			const ref = horseRef(e);

			// **馬名を直せるのは ref で引き当てたときだけ。**
			// 名前で引き当てている最中に名前を書き換えるのは循環していて成立しない
			// （引き当てが外れて別馬が1頭増えるだけになる）。
			// 打ち間違いを直すには、先に ref を振ってから名前を変える2段階になる。
			const rename = e.ref
				? `
  name = ${lit(e.name)},`
				: '';

			out.push(
				// 引き当たらなければ作る。
				`INSERT INTO horse (id, name, sex, birth_year, trainer, sire, dam, external_ref)
SELECT ${lit(newId())}, ${lit(e.name)}, ${lit(e.sex)}, ${lit(e.birthYear)}, ${lit(e.trainer)}, ${lit(e.sire)}, ${lit(e.dam)}, ${lit(e.ref)}
WHERE ${ref} IS NULL;`,
				// 既存馬は空いている属性だけ埋める。**プロフィールメモには触らない**（利用者が書いたもの）。
				// id で1行に固定しているので、同名の別馬を巻き添えにすることがない。
				`UPDATE horse SET${rename}
  sex = COALESCE(${lit(e.sex)}, sex),
  birth_year = COALESCE(${lit(e.birthYear)}, birth_year),
  trainer = COALESCE(${lit(e.trainer)}, trainer),
  sire = COALESCE(${lit(e.sire)}, sire),
  dam = COALESCE(${lit(e.dam)}, dam),
  external_ref = COALESCE(${lit(e.ref)}, external_ref),
  updated_at = unixepoch()
WHERE id = ${ref};`,
				// 出走馬は (race_id, horse_id) で upsert。**削除も再作成もしない**ので、
				// 紐づくメモが ON DELETE CASCADE で道連れになることがない。
				//
				// 枠・馬番・騎手は YAML が正なのでそのまま上書き（上で NULL に落としてある）。
				// **結果は COALESCE。** 書いてあれば上書きし（降着の訂正が効く）、
				// 書いていなければ既存を残す（画面から入れた値を YAML の再投入で消さない）。
				`INSERT INTO race_entry (
  id, race_id, horse_id, bracket, horse_number, jockey,
  finish_position, popularity, finish_time, margin, passing, last_3f,
  weight_carried, horse_weight, horse_weight_diff, odds
)
SELECT ${lit(newId())}, r.id, ${ref}, ${lit(e.bracket)}, ${lit(e.horseNumber)}, ${lit(e.jockey)},
  ${lit(e.finish)}, ${lit(e.popularity)}, ${lit(e.time)}, ${lit(e.margin)}, ${lit(e.passing)}, ${lit(e.last3f)},
  ${lit(e.weight)}, ${lit(e.horseWeight)}, ${lit(e.horseWeightDiff)}, ${lit(e.odds)}
FROM race r
WHERE ${raceKey('r.')} AND ${ref} IS NOT NULL
ON CONFLICT (race_id, horse_id) DO UPDATE SET
  bracket = excluded.bracket,
  horse_number = excluded.horse_number,
  jockey = excluded.jockey,
  finish_position = COALESCE(excluded.finish_position, race_entry.finish_position),
  popularity = COALESCE(excluded.popularity, race_entry.popularity),
  finish_time = COALESCE(excluded.finish_time, race_entry.finish_time),
  margin = COALESCE(excluded.margin, race_entry.margin),
  passing = COALESCE(excluded.passing, race_entry.passing),
  last_3f = COALESCE(excluded.last_3f, race_entry.last_3f),
  weight_carried = COALESCE(excluded.weight_carried, race_entry.weight_carried),
  horse_weight = COALESCE(excluded.horse_weight, race_entry.horse_weight),
  horse_weight_diff = COALESCE(excluded.horse_weight_diff, race_entry.horse_weight_diff),
  odds = COALESCE(excluded.odds, race_entry.odds);`
			);
		}
	}

	// **適用済みの記録は必ず最後。** 途中で落ちたらハッシュが残らず、次回もう一度流れる。
	out.push(
		`INSERT INTO data_import (file, hash, applied_at) VALUES (${lit(fileName)}, ${lit(hash)}, unixepoch())
ON CONFLICT (file) DO UPDATE SET hash = excluded.hash, applied_at = unixepoch();`
	);

	return out;
}

/**
 * 取り下げ。出走馬行を消す**前に、付いていたメモを近況メモ（kind='horse'）へ移す。**
 *
 * 出走馬行を消すと、紐づくメモ（出走前メモ・ふりかえり）が ON DELETE CASCADE で道連れになる。
 * 候補の段階で書いた見立ては、出走しなくてもその馬についての記録として残す価値がある。
 *
 * 移し方は note_kind_shape の CHECK に合わせる: race_id / race_entry_id を外し、
 * 印（出走前メモ専用）も外す。どのレースのメモだったかは本文の先頭に書き残す。
 * occurred_at はレースの日のままにして、馬のタイムラインでその週の位置に並ぶようにする。
 *
 * SET の右辺はどれも**更新前の行**を見る（SQLite の UPDATE の決まり）ので、
 * 本文を作る式の中の kind / mark は元の値。
 */
function withdrawStatements(
	date: string,
	race: RaceFile['races'][number],
	w: { name: string; ref?: string },
	raceKey: string
): string[] {
	const ref = horseRef(w);
	const entry = `SELECT id FROM race_entry WHERE race_id = (SELECT id FROM race WHERE ${raceKey}) AND horse_id = ${ref}`;
	const where = `${date} ${race.course}${race.raceNumber}R ${race.name}`;
	return [
		`-- 取り下げ: ${w.name}`,
		`UPDATE note SET
  kind = 'horse',
  race_id = NULL,
  race_entry_id = NULL,
  mark = NULL,
  body = '（' || ${lit(where)} || ' に出走しなかったため、'
    || CASE kind WHEN 'entry' THEN 'ふりかえり' ELSE '出走前メモ' END || 'から移しました'
    || CASE WHEN mark IS NULL THEN '' ELSE '。印 ' || mark END || '）'
    || CASE WHEN body = '' THEN '' ELSE char(10) || char(10) || body END,
  updated_at = unixepoch()
WHERE race_entry_id = (${entry});`,
		`DELETE FROM race_entry WHERE id = (${entry});`
	];
}

/** 同じレースの中で、馬番の重複と「出走馬にも取り下げにもいる馬」を見つける。 */
function raceConflicts(race: RaceFile['races'][number]): string[] {
	const errors: string[] = [];
	const label = `${race.course}${race.raceNumber}R`;

	const seen = new Map<number, string>();
	for (const e of race.entries) {
		if (e.horseNumber === undefined) continue;
		const other = seen.get(e.horseNumber);
		if (other)
			errors.push(`${label}: 馬番 ${e.horseNumber} が ${other} と ${e.name} で重複しています`);
		seen.set(e.horseNumber, e.name);
	}

	for (const w of race.withdrawn ?? []) {
		const hit = race.entries.find((e) => (w.ref && e.ref ? w.ref === e.ref : w.name === e.name));
		if (hit) {
			errors.push(
				`${label}: ${w.name} が entries と withdrawn の両方にいます。出走するなら withdrawn から外してください`
			);
		}
	}
	return errors;
}

/**
 * 馬齢から生年を導出し、`birthYear` に寄せる。
 * 出馬表には生年ではなく性齢（牡4）が載るので、書き写すだけで済むようにしておく。
 */
function normalizeEntry(e: Entry, date: string): { entry: Entry; error?: string } {
	if (e.age === undefined) return { entry: e };

	const derived = Number(date.slice(0, 4)) - e.age;
	if (e.birthYear !== undefined && e.birthYear !== derived) {
		return {
			entry: e,
			error: `${e.name}: age ${e.age}（生年 ${derived}）と birthYear ${e.birthYear} が食い違います`
		};
	}
	return { entry: { ...e, birthYear: derived } };
}

/**
 * 1ファイルを読んで検証し、馬齢を生年に寄せる。落ちる理由があれば全部返す。
 * 投入（main）と単体テストが同じ道を通るよう、ここに切り出してある。
 */
export function readRaceFile(
	raw: string,
	fileName: string
): { ok: true; output: RaceFile } | { ok: false; errors: string[] } {
	const parsed = v.safeParse(fileSchema, parse(raw));
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.issues.map(
				(issue) => `${issue.path?.map((p) => String(p.key)).join('.') ?? ''}: ${issue.message}`
			)
		};
	}

	// ファイル名と中身の日付が食い違うと、どの週のデータか分からなくなる。
	const expected = fileName.replace(/.ya?ml$/, '');
	if (expected !== parsed.output.date) {
		return { ok: false, errors: [`ファイル名と date（${parsed.output.date}）が一致しません`] };
	}

	// 馬齢 → 生年。ここで食い違いを見つけたら落とす。
	const errors: string[] = [];
	for (const race of parsed.output.races) {
		race.entries = race.entries.map((e) => {
			const { entry, error } = normalizeEntry(e, parsed.output.date);
			if (error) errors.push(error);
			return entry;
		});
		errors.push(...raceConflicts(race));
	}
	return errors.length > 0 ? { ok: false, errors } : { ok: true, output: parsed.output };
}

/**
 * 投入先ごとの、適用状況を読むための `wrangler d1 execute` の引数。
 *
 * **staging もここで差分を取る。** 以前は staging だけ `--all` で毎回全ファイルを流していて、
 * main へのマージのたびに全データ（約1万7千行の変更 + 索引の更新）を書き直していた。
 * D1 の Free の書き込み上限（1日10万行）は**アカウント単位**で本番と共有なので、
 * マージが続いた日に上限を使い切り、本番のメモの保存が落ちた。
 * staging D1 にも `data_import` はあるので、本番と同じく変わったファイルだけを流せば足りる。
 */
const TARGETS = {
	local: [DB_NAME, '--local'],
	remote: [DB_NAME, '--remote'],
	// Wrangler の D1 コマンドは previews.d1_databases を見ないので、同じ D1 を指す別設定を使う。
	staging: ['PREVIEW_DB', '--remote', '--config', 'wrangler.preview-migrations.toml']
} as const;

type Target = keyof typeof TARGETS;

const isTarget = (t: string | null): t is Target => t !== null && Object.hasOwn(TARGETS, t);

/** 適用済みのファイル名 → ハッシュ。テーブルがまだ無い等で引けなければ空で返す。 */
function loadAppliedHashes(target: Target): Map<string, string> {
	const result = spawnSync(
		process.execPath,
		[
			WRANGLER,
			'd1',
			'execute',
			...TARGETS[target],
			'--json',
			'--command',
			'SELECT file, hash FROM data_import'
		],
		{ encoding: 'utf8' }
	);

	const applied = new Map<string, string>();
	const raw = result.stdout ?? '';
	const start = raw.search(/[[{]/);

	if (result.status !== 0 || start < 0) {
		console.warn(
			`! 適用状況を読めませんでした（${target}）。全ファイルを対象にします。\n` +
				`  data_import が無いなら先に db:migrate:${target} を実行してください。`
		);
		return applied;
	}

	try {
		const collect = (node: unknown): void => {
			if (Array.isArray(node)) return node.forEach(collect);
			if (!node || typeof node !== 'object') return;
			const obj = node as Record<string, unknown>;
			if (Array.isArray(obj.results)) return obj.results.forEach(collect);
			if (typeof obj.file === 'string' && typeof obj.hash === 'string') {
				applied.set(obj.file, obj.hash);
			}
		};
		collect(JSON.parse(raw.slice(start)));
	} catch {
		console.warn(
			`! 適用状況の JSON を解釈できませんでした（${target}）。全ファイルを対象にします。`
		);
	}

	return applied;
}

async function main() {
	const args = process.argv.slice(2);
	const checkOnly = args.includes('--check');
	const forceAll = args.includes('--all');
	const outIndex = args.indexOf('--out');
	const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
	const targetIndex = args.indexOf('--target');
	const target = targetIndex >= 0 ? args[targetIndex + 1] : null;
	const dirIndex = args.indexOf('--dir');
	const dataDir = dirIndex >= 0 ? args[dirIndex + 1] : DEFAULT_DATA_DIR;

	if (!checkOnly && !isTarget(target)) {
		console.error('--target local | remote | staging を指定してください（--check なら不要）。');
		process.exit(1);
	}

	// **ファイルが1つも無いのは失敗ではない。**
	// 投入すべきレースがまだ無い状態は普通にあり、ここで落とすと
	// GitHub Actions のデプロイが毎回失敗する。
	let files: string[] = [];
	try {
		files = (await readdir(dataDir)).filter((f) => /\.ya?ml$/.test(f)).sort();
	} catch {
		console.log(`${dataDir} がありません。投入するものはありません。`);
	}

	if (files.length === 0) {
		console.log(`${dataDir} に .yaml がありません。投入するものはありません。`);
		if (!checkOnly && outPath) {
			await mkdir(dirname(outPath), { recursive: true });
			await writeFile(outPath, '-- 投入するファイルがありません。\nSELECT 1;\n', 'utf8');
			console.log(`SQL を書き出しました: ${outPath}`);
		}
		return;
	}

	// 適用状況の突き合わせは検証の**あと**。壊れた YAML は差分の有無に関わらず落としたい。
	const applied =
		checkOnly || forceAll || !isTarget(target)
			? new Map<string, string>()
			: loadAppliedHashes(target);

	const statements: string[] = [];
	// ref → その ref に対して書かれている馬名。**ファイルをまたいで**集める。
	// ref があると名前を上書きするので、食い違ったまま流すと
	// 「最後に流したファイルが勝つ」になり、馬名が行ったり来たりする。
	const namesByRef = new Map<string, Map<string, string[]>>();
	let raceCount = 0;
	let entryCount = 0;
	let changedCount = 0;
	let failed = false;

	for (const f of files) {
		const raw = await readFile(join(dataDir, f), 'utf8');
		const parsed = readRaceFile(raw, f);
		if (!parsed.ok) {
			failed = true;
			console.error(`✗ ${f}${parsed.errors.length === 1 ? `: ${parsed.errors[0]}` : ''}`);
			if (parsed.errors.length > 1) for (const e of parsed.errors) console.error(`    ${e}`);
			continue;
		}

		for (const race of parsed.output.races) {
			for (const e of race.entries) {
				if (!e.ref) continue;
				const byName = namesByRef.get(e.ref) ?? new Map<string, string[]>();
				byName.set(e.name, [...(byName.get(e.name) ?? []), f]);
				namesByRef.set(e.ref, byName);
			}
		}

		const fileEntries = parsed.output.races.reduce((n, r) => n + r.entries.length, 0);
		raceCount += parsed.output.races.length;
		entryCount += fileEntries;

		const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
		const unchanged = applied.get(f) === hash;

		if (unchanged) {
			console.log(
				`- ${f}  レース ${parsed.output.races.length} / 出走馬 ${fileEntries}（変更なし）`
			);
			continue;
		}

		changedCount += 1;
		statements.push(...statementsFor(parsed.output, f, hash));
		console.log(`✓ ${f}  レース ${parsed.output.races.length} / 出走馬 ${fileEntries}`);
	}

	// 同じ ref に複数の名前が付いていたら、どれが正か機械には決められない。
	for (const [ref, byName] of namesByRef) {
		if (byName.size <= 1) continue;
		failed = true;
		console.error(`✗ ref "${ref}" に複数の馬名が付いています`);
		for (const [name, files] of byName) {
			console.error(`    ${name}  ← ${files.join(', ')}`);
		}
		console.error('    ref は馬の同一性そのものなので、名前を揃えてください。');
	}

	if (failed) process.exit(1);
	console.log(
		`\n合計: レース ${raceCount} / 出走馬 ${entryCount}` +
			(checkOnly ? '' : ` — 流すファイル ${changedCount} / ${files.length}`)
	);

	if (checkOnly) return;

	// 差分が無くても SQL は書き出す。ここで何も書かないと、続く
	// `wrangler d1 execute --file` が前回の SQL を読んで流し直してしまう。
	const sql =
		changedCount === 0
			? '-- 差分なし。適用するものはありません。\nSELECT 1;\n'
			: statements.join('\n') + '\n';

	if (outPath) {
		await mkdir(dirname(outPath), { recursive: true });
		await writeFile(outPath, sql, 'utf8');
		console.log(`SQL を書き出しました: ${outPath}`);
	} else {
		process.stdout.write(sql);
	}
}

// 単体テストから import したときは走らせない。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
