/**
 * netkeiba から出馬表・過去走・馬の基本情報・結果を取ってきて、data/races/*.yaml に書き込む。
 *
 * **書くのは YAML まで。** D1 には触らない。書いたあとは `data:check` を通して PR にする
 * （投入は data/README.md の経路のまま）。人でも AI でも、同じコマンドで同じ YAML になる。
 *
 *   pnpm run data:fetch races   2026-09-27              その日のレース一覧（race_id）
 *   pnpm run data:fetch entries 2026-09-27 中山 11      候補（枠順前）/ 枠順（確定後）
 *   pnpm run data:fetch past    2026-09-27 中山 11      出走馬の過去5走
 *   pnpm run data:fetch horses  2026-09-27 中山 11      馬の基本情報（性齢・調教師・血統）
 *   pnpm run data:fetch result  2026-09-27 中山 11      結果
 *
 * オプション:
 *   --dir <dir>        書き込み先（既定 data/races）。試すときは作業用のディレクトリを渡す
 *   --race-id <id>     netkeiba の race_id を直接指定する（一覧から引けないとき）
 *   --count <n>        past: 何走さかのぼるか（既定 5）
 *   --horse <名前|ref> past / horses: 対象の馬を絞る（複数回書ける）
 *   --interval <ms>    取得の間隔（既定 1000。500 まで縮められる）
 *   --require-confirmed entries: 枠順が確定していなければ何も書かずに終える（定期取得用）
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	applyPastRuns,
	applyProfile,
	applyResult,
	applyRaceRef,
	applyShutuba,
	type ResolvePerson
} from './race-data/apply.ts';
import {
	COURSE_CODES,
	fetchPage,
	fromRef,
	MIN_REQUEST_INTERVAL_MS,
	parseHorseProfile,
	parseHorseResults,
	parsePedigree,
	parsePersonName,
	parseRaceList,
	parseResult,
	parseShutuba,
	setRequestInterval,
	toHalfWidth,
	urls,
	type Course
} from './race-data/netkeiba.ts';
import { RaceFile } from './race-data/yaml-file.ts';

const DEFAULT_DIR = 'data/races';
/** 騎手・調教師の ID → 名前。何度も引かないよう手元に残す（リポジトリには入れない）。 */
const PEOPLE_CACHE = join('node_modules', '.cache', 'race-data', 'people.json');

type Args = {
	command: string;
	positional: string[];
	dir: string;
	raceId?: string;
	count: number;
	horses: string[];
	interval?: number;
	requireConfirmed: boolean;
};

function parseArgs(argv: string[]): Args {
	const positional: string[] = [];
	const horses: string[] = [];
	let dir = DEFAULT_DIR;
	let raceId: string | undefined;
	let count = 5;
	let interval: number | undefined;
	let requireConfirmed = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') continue;
		else if (a === '--dir') dir = argv[++i];
		else if (a === '--race-id') raceId = argv[++i];
		else if (a === '--count') count = Number(argv[++i]);
		else if (a === '--horse') horses.push(argv[++i]);
		else if (a === '--interval') interval = Number(argv[++i]);
		else if (a === '--require-confirmed') requireConfirmed = true;
		else positional.push(a);
	}
	const [command = '', ...rest] = positional;
	return { command, positional: rest, dir, raceId, count, horses, interval, requireConfirmed };
}

/** 利用者に見せて止めるエラー。スタックは出さない。 */
class Failure extends Error {}

/**
 * 止める。process.exit はここでは呼ばない。fetch の接続が開いたまま exit すると、
 * Windows の Node が libuv の assertion で落ちる（終了コードも 127 になる）。
 */
function fail(message: string): never {
	throw new Failure(message);
}

function parseTarget(args: Args): { date: string; course: Course; raceNumber: number } {
	const [date, course, r] = args.positional;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) fail('日付は YYYY-MM-DD で指定してください');
	if (!Object.values(COURSE_CODES).includes(course as Course)) {
		fail(`競馬場は JRA の10場で指定してください: ${course ?? '(なし)'}`);
	}
	const raceNumber = Number(String(r ?? '').replace(/R$/i, ''));
	if (!Number.isInteger(raceNumber) || raceNumber < 1 || raceNumber > 12) {
		fail('レース番号は 1〜12 で指定してください');
	}
	return { date, course: course as Course, raceNumber };
}

async function resolveRaceId(
	args: Args,
	t: { date: string; course: Course; raceNumber: number }
): Promise<string> {
	if (args.raceId) {
		// race_id には年・場・R が入っている。打ち間違えると別レースの馬が入り、
		// 既存の行がすべて withdrawn に移る（data:check では止まらない）ので、ここで突き合わせる。
		const id = args.raceId;
		const matches =
			/^\d{12}$/.test(id) &&
			id.slice(0, 4) === t.date.slice(0, 4) &&
			COURSE_CODES[id.slice(4, 6)] === t.course &&
			Number(id.slice(10, 12)) === t.raceNumber;
		if (!matches) {
			fail(
				`--race-id ${id} は ${t.date.slice(0, 4)}年 ${t.course}${t.raceNumber}R のものではありません` +
					`（race_id は 年4桁・場2桁・回2桁・日2桁・R2桁）。`
			);
		}
		return id;
	}
	const list = parseRaceList(await fetchPage(urls.raceList(t.date)));
	const hit = list.find((r) => r.course === t.course && r.raceNumber === t.raceNumber);
	if (!hit) {
		fail(
			`${t.date} ${t.course}${t.raceNumber}R が netkeiba のレース一覧にありません。\n` +
				'  一覧は当週ぶんしか出ないことがあります。race_id が分かるなら --race-id で渡してください。'
		);
	}
	return hit.raceId;
}

async function peopleResolver(): Promise<{ resolve: ResolvePerson; flush: () => Promise<void> }> {
	let cache: Record<string, string> = {};
	try {
		cache = JSON.parse(await readFile(PEOPLE_CACHE, 'utf8'));
	} catch {
		// 初回は空。
	}
	let dirty = false;
	const resolve: ResolvePerson = async (kind, person) => {
		const key = `${kind}:${person.id}`;
		if (cache[key]) return cache[key];
		try {
			let name = parsePersonName(await fetchPage(urls[kind](person.id)));
			// プロフィールは `C.ルメール`、戦績表は `ルメール`。頭文字は兄弟など紛らわしいとき
			// （`C.デムーロ` / `M.デムーロ`）だけ残すのが netkeiba の略し方で、既存データもそれに倣う。
			// 出馬表・結果の略称に頭文字が無ければ落とす（略称は `ルメー` と途中で切れることがある）。
			const short = toHalfWidth(person.short);
			if (name && /^[A-Z]\./.test(name) && short.length >= 2 && name.slice(2).startsWith(short)) {
				name = name.slice(2);
			}
			if (name) {
				cache[key] = name;
				dirty = true;
				return name;
			}
		} catch (e) {
			console.warn(`! ${kind} ${person.id} の名前を引けませんでした: ${(e as Error).message}`);
		}
		return person.short;
	};
	const flush = async () => {
		if (!dirty) return;
		await mkdir(dirname(PEOPLE_CACHE), { recursive: true });
		await writeFile(PEOPLE_CACHE, JSON.stringify(cache, null, '\t'), 'utf8');
	};
	return { resolve, flush };
}

async function loadRace(args: Args, t: { date: string; course: Course; raceNumber: number }) {
	const file = await RaceFile.load(args.dir, t.date);
	const race = file.findRace(t.course, t.raceNumber);
	if (!race) {
		fail(
			`${file.path} に ${t.course}${t.raceNumber}R がありません。先に entries で出馬表を入れてください。`
		);
	}
	return { file, race };
}

/**
 * 取ってきたページが指定した開催日のものかを見る。race_id の回・日までは引数から
 * 決められないので、ページの title の日付で突き合わせる（別の週の同じ場・R を防ぐ）。
 */
function assertSameDate(
	meta: { date?: string; name: string },
	t: { date: string },
	raceId: string
) {
	if (meta.date && meta.date !== t.date) {
		fail(`race_id ${raceId} は ${meta.date} の ${meta.name} です（指定は ${t.date}）。`);
	}
}

/** --horse で絞る。名前か ref のどちらでも当てる。 */
function selectEntries(args: Args, file: RaceFile, race: ReturnType<RaceFile['findRace']>) {
	const all = file.entries(race!).items;
	if (args.horses.length === 0) return all;
	return all.filter((e) => args.horses.some((h) => h === e.get('name') || h === e.get('ref')));
}

function print(title: string, lines: string[]) {
	console.log(title);
	for (const l of lines) console.log(`  ${l}`);
}

async function saveAll(files: Iterable<RaceFile>) {
	const saved: string[] = [];
	for (const f of files) {
		if (await f.save()) saved.push(`${f.created ? '新規' : '更新'} ${f.path}`);
	}
	console.log(saved.length > 0 ? `\n${saved.join('\n')}` : '\n変更はありません。');
	if (saved.length > 0) console.log('\n次: pnpm run data:check');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.interval !== undefined) {
		if (!Number.isFinite(args.interval) || args.interval < MIN_REQUEST_INTERVAL_MS) {
			fail(`--interval は ${MIN_REQUEST_INTERVAL_MS} 以上のミリ秒で指定してください`);
		}
		setRequestInterval(args.interval);
	}

	switch (args.command) {
		case 'races': {
			const date = args.positional[0];
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) fail('日付は YYYY-MM-DD で指定してください');
			const list = parseRaceList(await fetchPage(urls.raceList(date)));
			if (list.length === 0) fail(`${date} のレースが netkeiba の一覧にありません。`);
			for (const r of list)
				console.log(`${r.course} ${String(r.raceNumber).padStart(2)}R  ${r.raceId}  ${r.title}`);
			return;
		}

		case 'entries': {
			const t = parseTarget(args);
			const raceId = await resolveRaceId(args, t);
			const parsed = parseShutuba(await fetchPage(urls.shutuba(raceId)));
			assertSameDate(parsed.meta, t, raceId);
			if (parsed.rows.length === 0) {
				fail(`出馬表に馬がいません（race_id ${raceId}）。登録前か、ページの構造が変わっています。`);
			}
			// 定期取得（.github/workflows/race-data-fetch.yml）は枠順を待っている。候補の入れ替えだけで
			// PR を作らないよう、確定前は書かずに終える。騎手・調教師を引く前に止めるので、取得は1〜2回で済む。
			if (args.requireConfirmed && !parsed.rows.some((r) => r.horseNumber !== undefined)) {
				console.log(
					`${t.date} ${t.course}${t.raceNumber}R（${raceId}）: 枠順未確定のため書きません`
				);
				return;
			}
			const file = await RaceFile.load(args.dir, t.date);
			const people = await peopleResolver();
			const log = await applyShutuba(file, t.course, t.raceNumber, parsed, people.resolve);
			log.push(...applyRaceRef(file, t.course, t.raceNumber, raceId, parsed.meta));
			await people.flush();
			print(`${t.date} ${t.course}${t.raceNumber}R ${parsed.meta.name}（${raceId}）`, log);
			await saveAll([file]);
			return;
		}

		case 'past': {
			const t = parseTarget(args);
			const { file, race } = await loadRace(args, t);
			const files = new Map<string, RaceFile>([[t.date, file]]);
			const people = await peopleResolver();
			const openFile = async (date: string) => {
				if (!files.has(date)) files.set(date, await RaceFile.load(args.dir, date, '過去走'));
				return files.get(date)!;
			};

			for (const entry of selectEntries(args, file, race)) {
				const name = entry.get('name') as string;
				const ref = entry.get('ref') as string | undefined;
				const horseId = ref ? fromRef(ref) : null;
				if (!ref || !horseId) {
					console.log(
						`! ${name}: netkeiba の ref（nk-…）が無いので飛ばします。先に entries を流してください`
					);
					continue;
				}
				const runs = parseHorseResults(await fetchPage(urls.horseResults(horseId)));
				const log = await applyPastRuns(
					openFile,
					{ name, ref },
					runs,
					{ before: t.date, count: args.count },
					people.resolve
				);
				print(name, log);
			}
			await people.flush();
			await saveAll(files.values());
			return;
		}

		case 'horses': {
			const t = parseTarget(args);
			const { file, race } = await loadRace(args, t);
			const people = await peopleResolver();
			const log: string[] = [];
			for (const entry of selectEntries(args, file, race)) {
				const ref = entry.get('ref') as string | undefined;
				const horseId = ref ? fromRef(ref) : null;
				if (!horseId) {
					log.push(`! ${entry.get('name')}: netkeiba の ref が無いので飛ばします`);
					continue;
				}
				const profile = parseHorseProfile(await fetchPage(urls.horse(horseId)));
				// プロフィール表の調教師名は途中で切れる。出馬表・結果と同じ名前に引き直す。
				if (profile.trainer && profile.trainerId) {
					profile.trainer = await people.resolve('trainer', {
						id: profile.trainerId,
						short: profile.trainer
					});
				}
				const ped = JSON.parse(await fetchPage(urls.pedigree(horseId))) as { data?: string };
				log.push(
					...applyProfile(
						file,
						race,
						entry,
						{ ...profile, ...parsePedigree(ped.data ?? '') },
						Number(t.date.slice(0, 4))
					)
				);
			}
			await people.flush();
			print(`${t.date} ${t.course}${t.raceNumber}R ${race.get('name')}`, log);
			await saveAll([file]);
			return;
		}

		case 'result': {
			const t = parseTarget(args);
			const { file, race } = await loadRace(args, t);
			const raceId = await resolveRaceId(args, t);
			const parsed = parseResult(await fetchPage(urls.result(raceId)));
			assertSameDate(parsed.meta, t, raceId);
			if (parsed.rows.length === 0) {
				fail(`結果がまだ出ていません（race_id ${raceId}）。`);
			}
			const people = await peopleResolver();
			const log = await applyResult(file, race, parsed, people.resolve);
			await people.flush();
			print(
				`${t.date} ${t.course}${t.raceNumber}R ${race.get('name')}（${parsed.meta.trackCondition ?? '?'} / ${parsed.meta.weather ?? '?'}）`,
				log
			);
			await saveAll([file]);
			return;
		}

		default:
			fail(
				[
					'使い方:',
					'  pnpm run data:fetch races   <日付>',
					'  pnpm run data:fetch entries <日付> <場> <R>',
					'  pnpm run data:fetch past    <日付> <場> <R> [--count 5] [--horse 馬名]',
					'  pnpm run data:fetch horses  <日付> <場> <R> [--horse 馬名]',
					'  pnpm run data:fetch result  <日付> <場> <R>',
					'共通: --dir <書き込み先>  --race-id <netkeiba の race_id>  --interval <ms>'
				].join('\n')
			);
	}
}

try {
	await main();
} catch (e) {
	if (!(e instanceof Failure)) throw e;
	console.error(e.message);
	process.exitCode = 1;
}
