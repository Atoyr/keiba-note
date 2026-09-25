/**
 * netkeiba から読んだものを YAML に当てはめる。**取得はしない**（引数で受け取る）ので、
 * ここはネットワーク無しで単体テストできる。
 *
 * どの項目を上書きし、どれを残すかはここで決まる。
 *
 * | 手順     | 上書きするもの                                   | 残すもの                 |
 * | -------- | ------------------------------------------------ | ------------------------ |
 * | 出馬表   | 枠・馬番（確定後）・騎手・性齢・斤量・調教師・ref | 馬名・結果・血統         |
 * | 過去走   | —（空いている項目だけ埋める。頭数・勝ち馬もここで入る） | 既に書いてある値すべて |
 * | 基本情報 | 性・馬齢・調教師・父・母・ref                     | 馬名・レースの値         |
 * | 結果     | 着順から馬体重まで・騎手・枠・馬番・馬場・天候・頭数・勝ち馬・2着馬 | 馬名・基本情報 |
 *
 * **馬名は書き換えない。** ref が付いた馬の名前を変えると、ほかの開催日のファイルと
 * 食い違って `data:check` が落ちる（data/README.md「馬名を直す」）。食い違いは警告だけ出す。
 */

import type { YAMLMap } from 'yaml';
import {
	fromRef,
	toRef,
	type HorseProfile,
	type PastRun,
	type Person,
	type RaceMeta,
	type ResultRow,
	type ShutubaRow
} from './netkeiba.ts';
import type { Fields, RaceFields, RaceFile } from './yaml-file.ts';

/** 騎手・調教師の略称を、略さない名前に引き直す。 */
export type ResolvePerson = (kind: 'jockey' | 'trainer', person: Person) => Promise<string>;

export function raceFields(meta: RaceMeta): RaceFields {
	return {
		name: meta.name,
		grade: meta.grade,
		className: meta.grade ? undefined : meta.className,
		surface: meta.surface,
		distance: meta.distance,
		direction: meta.direction
	};
}

/**
 * レースの取得元 ID（`nk-` + race_id）と発走時刻を書く。**これが入った重賞（G1〜G3）だけ、オッズを
 * 取りに行く**（docs/product.md 第1章）。netkeiba が正なので上書きする。
 */
export function applyRaceRef(
	file: RaceFile,
	course: string,
	raceNumber: number,
	raceId: string,
	meta: RaceMeta
): string[] {
	const race = file.ensureRace(course, raceNumber, raceFields(meta));
	const ref = toRef(raceId);
	file.setRaceFields(race, { ref, startTime: meta.startTime }, 'overwrite');
	return [
		meta.startTime
			? `ref ${ref} / 発走 ${meta.startTime}`
			: `ref ${ref}（発走時刻が読めませんでした。オッズは取りに行きません）`
	];
}

/** YAML の行の馬名と netkeiba の馬名が違うときの警告。 */
function nameWarning(entry: YAMLMap, name: string): string[] {
	const current = entry.get('name');
	return current && current !== name
		? [`! ${current}: netkeiba では「${name}」。馬名は書き換えていません`]
		: [];
}

function label(e: YAMLMap): string {
	const no = e.get('horseNumber');
	return `${no ? `${String(no).padStart(2)} ` : ''}${e.get('name')}`;
}

/**
 * 枠順が確定した出馬表か。**馬番が1頭でも付いていれば確定。** 枠が決まる前の出馬表（登録馬）には馬番が無い。
 * 定期取得（`--require-confirmed`）は、これが偽なら何も書かずに終える。
 */
export function isShutubaConfirmed(rows: readonly Pick<ShutubaRow, 'horseNumber'>[]): boolean {
	return rows.some((r) => r.horseNumber !== undefined);
}

/**
 * 出馬表を当てはめる。**netkeiba の一覧を正とし、載っていない行は `withdrawn` に移す。**
 *
 * - 枠が決まる前（馬番が1頭も無い）: 登録馬を候補として足す。回避した馬は取り下げる
 * - 枠が決まった後: 枠・馬番を入れ、出走しない候補を取り下げる
 */
export async function applyShutuba(
	file: RaceFile,
	course: string,
	raceNumber: number,
	parsed: { meta: RaceMeta; rows: ShutubaRow[] },
	resolve: ResolvePerson
): Promise<string[]> {
	const log: string[] = [];
	const confirmed = isShutubaConfirmed(parsed.rows);
	const race = file.ensureRace(course, raceNumber, raceFields(parsed.meta));
	const kept = new Set<YAMLMap>();
	const order = new Map<YAMLMap, number>();

	for (const [i, row] of parsed.rows.entries()) {
		const ref = toRef(row.horseId);
		const existing = file.findEntry(race, { ref, name: row.name });
		if (existing) log.push(...nameWarning(existing, row.name));

		const fields: Fields = {
			name: (existing?.get('name') as string | undefined) ?? row.name,
			ref,
			sex: row.sex,
			age: row.age,
			weight: row.weight,
			jockey: row.jockey ? await resolve('jockey', row.jockey) : undefined,
			trainer: row.trainer ? await resolve('trainer', row.trainer) : undefined,
			...(confirmed ? { bracket: row.bracket, horseNumber: row.horseNumber } : {})
		};
		if (file.unwithdraw(race, { ref, name: row.name })) {
			log.push(`↺ ${row.name}: 取り下げから戻しました`);
		}
		const { entry, added } = file.upsertEntry(race, fields, 'overwrite');
		kept.add(entry);
		order.set(entry, i);
		if (added) log.push(`+ ${label(entry)}`);
	}

	for (const entry of file.entries(race).items.slice()) {
		if (kept.has(entry)) continue;
		file.withdraw(race, entry);
		log.push(`- ${entry.get('name')}（出馬表に無いので withdrawn へ）`);
	}

	file.sortEntries(race, confirmed ? undefined : (e) => order.get(e) ?? 999);
	log.unshift(
		confirmed
			? `枠順確定: ${parsed.rows.length}頭`
			: `枠順未確定: 登録馬 ${parsed.rows.length}頭を候補として入れます`
	);
	return log;
}

/**
 * 1頭ぶんの過去走を、それぞれの開催日のファイルに足す。
 *
 * - `before` より前の、JRA のレースだけ（地方・海外はパーサの時点で落ちている）
 * - 取消・除外（走っていない）は数えない
 * - 既にある値は書き換えない（`fill`）
 * - 騎手は `resolve` があれば略さない名前に引き直す
 */
export async function applyPastRuns(
	openFile: (date: string) => Promise<RaceFile>,
	horse: { name: string; ref: string },
	runs: PastRun[],
	opts: { before: string; count: number },
	resolve?: ResolvePerson
): Promise<string[]> {
	const picked = runs
		.filter((r) => r.date < opts.before && !/取|除/.test(r.status ?? ''))
		.slice(0, opts.count);
	const log: string[] = [];

	for (const run of picked) {
		const file = await openFile(run.date);
		const race = file.ensureRace(run.course, run.raceNumber, {
			...raceFields(run.race),
			trackCondition: run.race.trackCondition,
			weather: run.race.weather,
			fieldSize: run.race.fieldSize,
			winner: run.race.winner,
			runnerUp: run.race.runnerUp
		});
		const { added } = file.upsertEntry(
			race,
			{
				name: horse.name,
				ref: horse.ref,
				bracket: run.bracket,
				horseNumber: run.horseNumber,
				// 戦績表の騎手名は途中で切れる。ID があれば出馬表・結果と同じ名前に引き直す。
				jockey:
					run.jockey && run.jockeyId && resolve
						? await resolve('jockey', { id: run.jockeyId, short: run.jockey })
						: run.jockey,
				finish: run.finish,
				popularity: run.popularity,
				time: run.time,
				timeDiff: run.timeDiff,
				passing: run.passing,
				last3f: run.last3f,
				weight: run.weight,
				horseWeight: run.horseWeight,
				horseWeightDiff: run.horseWeightDiff,
				odds: run.odds
			},
			'fill'
		);
		file.sortEntries(race);
		log.push(
			`${added ? '+' : '='} ${run.date} ${run.course}${run.raceNumber}R ${race.get('name')}` +
				` ${run.finish ? `${run.finish}着` : (run.status ?? '')}`
		);
	}
	if (picked.length < opts.count) {
		log.push(`（JRA の過去走は ${picked.length} 走ぶんしかありません）`);
	}
	return log;
}

/** 馬の基本情報（性・馬齢・調教師・血統）を出走馬行に入れる。馬齢はそのレースの年で数える。 */
export function applyProfile(
	file: RaceFile,
	race: YAMLMap,
	entry: YAMLMap,
	profile: HorseProfile & { sire?: string; dam?: string },
	raceYear: number
): string[] {
	const name = entry.get('name') as string;
	const log = nameWarning(entry, profile.name || name);
	const before = file.toString();
	file.upsertEntry(
		race,
		{
			name,
			ref: entry.get('ref') as string,
			sex: profile.sex,
			age: profile.birthYear ? raceYear - profile.birthYear : undefined,
			trainer: profile.trainer,
			sire: profile.sire,
			dam: profile.dam
		},
		'overwrite'
	);
	log.push(`${file.toString() === before ? '=' : '~'} ${label(entry)}`);
	return log;
}

/**
 * 結果の表から出走頭数を数える。**取消・除外は数えない**（走っていない）。中止・失格は走ったので数える。
 * 戦績表の「頭数」と同じ数え方。表が空（結果がまだ出ていない）なら書かない。
 */
export function fieldSizeOf(rows: readonly Pick<ResultRow, 'status'>[]): number | undefined {
	const started = rows.filter((r) => !/取|除/.test(r.status ?? '')).length;
	return started > 0 ? started : undefined;
}

/** `1:58.4` → 118.4。読めなければ undefined。 */
function seconds(time: string | undefined): number | undefined {
	const m = /^(?:(\d+):)?(\d+(?:\.\d)?)$/.exec(time ?? '');
	return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : undefined;
}

/**
 * 結果の表のタイムから、勝ち馬とのタイム差（秒）を出す。戦績表の「着差」と同じ形にそろえる:
 * 勝ち馬は2着以下で最も速い馬との差を負の値で（`-0.2`）、ほかは勝ち馬との差（`0.4`）。
 * 0.1秒単位に丸める（浮動小数の端数を YAML に書かない）。タイムの無い馬（取消・中止）は入らない。
 */
export function timeDiffs(rows: readonly ResultRow[]): Map<ResultRow, number> {
	const timed = rows.flatMap((r) => {
		const t = seconds(r.time);
		return t === undefined || r.finish === undefined ? [] : [{ r, t }];
	});
	const best = (list: typeof timed) => Math.min(...list.map((x) => x.t));
	const winners = timed.filter((x) => x.r.finish === 1);
	const out = new Map<ResultRow, number>();
	if (winners.length === 0) return out;
	const top = best(winners);
	for (const { r, t } of timed) {
		const others = timed.filter((x) => x.r !== r);
		const base = r.finish === 1 ? (others.length > 0 ? best(others) : t) : top;
		out.set(r, Math.round((t - base) * 10) / 10 || 0);
	}
	return out;
}

/**
 * 結果を当てはめる。YAML に載っている馬だけを更新する。
 * 条件戦では気にしている馬だけを載せる運用なので、載っていない馬は足さない。
 */
export async function applyResult(
	file: RaceFile,
	race: YAMLMap,
	parsed: { meta: RaceMeta; rows: ResultRow[] },
	resolve: ResolvePerson
): Promise<string[]> {
	const log: string[] = [];
	file.setRaceFields(
		race,
		{
			trackCondition: parsed.meta.trackCondition,
			weather: parsed.meta.weather,
			fieldSize: fieldSizeOf(parsed.rows),
			winner: parsed.rows.find((r) => r.finish === 1)?.name,
			runnerUp: parsed.rows.find((r) => r.finish === 2)?.name
		},
		'overwrite'
	);

	const diffs = timeDiffs(parsed.rows);
	const used = new Set<ResultRow>();
	for (const entry of file.entries(race).items.slice()) {
		const ref = entry.get('ref') as string | undefined;
		const row =
			parsed.rows.find((r) => ref && fromRef(ref) === r.horseId) ??
			parsed.rows.find((r) => r.name === entry.get('name'));
		if (!row) {
			log.push(`! ${entry.get('name')}: 結果の表にいません`);
			continue;
		}
		used.add(row);
		file.upsertEntry(
			race,
			{
				name: entry.get('name') as string,
				ref: ref ?? toRef(row.horseId),
				bracket: row.bracket,
				horseNumber: row.horseNumber,
				jockey: row.jockey ? await resolve('jockey', row.jockey) : undefined,
				finish: row.finish,
				popularity: row.popularity,
				time: row.time,
				timeDiff: diffs.get(row),
				margin: row.margin,
				passing: row.passing,
				last3f: row.last3f,
				weight: row.weight,
				horseWeight: row.horseWeight,
				horseWeightDiff: row.horseWeightDiff,
				odds: row.odds
			},
			'overwrite'
		);
		log.push(
			`${row.finish ? `${String(row.finish).padStart(2)}着` : (row.status ?? '---')} ${row.name}`
		);
	}
	file.sortEntries(race);

	const rest = parsed.rows.filter((r) => !used.has(r));
	if (rest.length > 0) {
		log.push(
			`（YAML に無い ${rest.length} 頭は足していません: ${rest.map((r) => r.name).join('、')}）`
		);
	}
	return log;
}
