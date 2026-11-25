/**
 * JRA の「全レース結果」ページから、**レコード**と書かれた走りを読む。
 *
 * netkeiba の結果・戦績・馬柱にはレコードの印が無い。JRA の結果ページだけ、1着の行の着差の欄に
 * `<strong class="record">レコード</strong>` が付く（同タイムの2着には付かない。同じ日に2回破られれば両方に付く）。
 *
 * ページは `POST https://www.jra.go.jp/JRADB/accessS.html`（本文 `cname=<値>`）で、Shift_JIS。
 * cname の末尾 `/XX` は照合用の値で組み立てられないので、リンクから拾ってたどる:
 *
 * 1. 過去レース結果検索 `pw01skl00999999/B3`。JS に `objParam["2511"]="EC";…`（YYMM → 照合値）
 * 2. 月 `pw01skl10YYYYMM/<照合値>`。開催日へのリンク `pw01srl…`
 * 3. 開催日の `pw01srl…` のページに、その場・日の全レース結果へのリンク `pw01ses…`
 * 4. 全レース結果 `pw01ses…`。レースごとに `race_result_unit`
 *
 * **読み替えはここに閉じる。** HTML が変わったときに直すのはこのファイルだけ。取り方の約束は netkeiba.ts と同じ
 * （1リクエストごとに間を空ける。壊れたら黙って空を返さず、呼び出し側が気づける形で返す）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { COURSE_CODES } from './netkeiba.ts';

const ENDPOINT = 'https://www.jra.go.jp/JRADB/accessS.html';
const SEARCH_CNAME = 'pw01skl00999999/B3';
const USER_AGENT = 'Mozilla/5.0 (uma-memo data entry; personal use)';

const DEFAULT_INTERVAL_MS = 1000;
let intervalMs = DEFAULT_INTERVAL_MS;
let lastRequestAt = 0;

/** リクエストの間隔（ミリ秒）。netkeiba 側の `setRequestInterval` と同じ値を渡す。 */
export function setJraRequestInterval(ms: number): void {
	intervalMs = ms;
}

/** cname を POST して、Shift_JIS のページを文字列で返す。 */
export async function postJra(cname: string): Promise<string> {
	const wait = lastRequestAt + intervalMs - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `cname=${encodeURIComponent(cname)}`
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}: JRA ${cname}`);
	return new TextDecoder('shift_jis').decode(new Uint8Array(await res.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// 読み替え（純関数）
// ---------------------------------------------------------------------------

/** 検索ページの `objParam["2511"]="EC"` を、YYMM → 照合値の表にする。 */
export function parseMonthParams(html: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of html.matchAll(/objParam\["(\d{4})"\]\s*=\s*"([0-9A-Fa-f]{2})"/g)) {
		out.set(m[1], m[2]);
	}
	return out;
}

/**
 * 検索ページの `var yearMonth = "202611"`。この月以降は `pw01skl00`、前は `pw01skl10`（ページの JS の分岐）。
 * 読めなければ undefined。
 */
export function parseCurrentYearMonth(html: string): string | undefined {
	return /var\s+yearMonth\s*=\s*"(\d{6})"/.exec(html)?.[1];
}

export type DayLink = { courseCode: string; date: string; cname: string };

/** 月のページの、開催日へのリンク `pw01srl…`。場コード・日付・cname。 */
export function parseDayLinks(html: string): DayLink[] {
	const seen = new Set<string>();
	const out: DayLink[] = [];
	// pw01srl{種別2}{場2}{年4}{回2}{日2}{YYYYMMDD}/{照合2}
	for (const m of html.matchAll(
		/pw01srl\d{2}(\d{2})\d{4}\d{2}\d{2}(\d{4})(\d{2})(\d{2})\/[0-9A-Fa-f]{2}/g
	)) {
		const cname = m[0];
		if (seen.has(cname)) continue;
		seen.add(cname);
		out.push({ courseCode: m[1], date: `${m[2]}-${m[3]}-${m[4]}`, cname });
	}
	return out;
}

/** 開催日のページの、全レース結果へのリンク `pw01ses…`（その場・日の1つ）。無ければ undefined。 */
export function parseSesLink(html: string): string | undefined {
	return /pw01ses\d{2}\d{2}\d{4}\d{2}\d{2}\d{8}\/[0-9A-Fa-f]{2}/.exec(html)?.[0];
}

/** レコードと書かれた1着の行。馬番は読めなければ無い。 */
export type JraRecordMark = {
	raceNumber: number;
	horseNumber?: number;
	name: string;
	time: string;
};

const text = (html: string) =>
	html
		.replace(/<[^>]*>/g, '')
		.replaceAll('&nbsp;', ' ')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * 全レース結果のページから、着差の欄に `strong.record` がある行を、レースごとに返す。
 * レースが1つも見つからなければ空（呼び出し側は「まだ結果が出ていない」と見て覚えない）。
 */
export function parseRaceRecords(html: string): { races: number; marks: JraRecordMark[] } {
	const marks: JraRecordMark[] = [];
	const units = [...html.matchAll(/<div class="race_result_unit" id="race_result_(\d+)R">/g)];
	for (const [i, u] of units.entries()) {
		const raceNumber = Number(u[1]);
		const chunk = html.slice(u.index, units[i + 1]?.index ?? html.length);
		for (const tr of chunk.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
			if (!/<td class="place">/.test(tr)) continue;
			const margin = /<td class="margin">([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? '';
			if (!/<strong class="record">/.test(margin)) continue;
			const num = Number(text(/<td class="num">([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? ''));
			marks.push({
				raceNumber,
				horseNumber: Number.isInteger(num) && num > 0 ? num : undefined,
				name: text(/<td class="horse">([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? ''),
				time: text(/<td class="time">([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? '')
			});
		}
	}
	return { races: units.length, marks };
}

// ---------------------------------------------------------------------------
// 取得（開催の単位）
// ---------------------------------------------------------------------------

export type JraDeps = {
	/** cname を POST してページを返す。 */
	post: (cname: string) => Promise<string>;
	/** 開催（日付×場）の結果の覚え書きの置き場。 */
	cacheDir: string;
	/** 取れなかった理由を知らせる。 */
	warn: (message: string) => void;
	/** 今日（JST、`YYYY-MM-DD`）。開催日が今日より前のときだけ結果を覚える。省略は実際の今日 */
	today?: () => string;
};

/** 日本時間の今日。 */
export const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const COURSE_TO_CODE = Object.fromEntries(Object.entries(COURSE_CODES).map(([c, n]) => [n, c]));

export const DEFAULT_CACHE_DIR = join('node_modules', '.cache', 'race-data', 'jra');

/**
 * 開催（日付×場）のレコードの行を返す関数を作る。
 *
 * - 検索ページと月のページは実行中だけ覚える
 * - **全レース結果は確定したら変わらない**ので、パースした結果を `cacheDir/<日付>-<場>.json` に覚える。
 *   結果が出る前（月のページにその日のリンクが無い・ページにレースが無い）は覚えない
 * - 取れないとき（リンクが無い・JRA が落ちている）は警告を出して `null`。「レコードは無い」とは言わない
 */
export function createJraRecords(deps: JraDeps) {
	let search: { params: Map<string, string>; current?: string } | undefined;
	const months = new Map<string, Map<string, string>>();

	async function monthDays(ym: string): Promise<Map<string, string>> {
		const hit = months.get(ym);
		if (hit) return hit;
		if (!search) {
			const html = await deps.post(SEARCH_CNAME);
			search = { params: parseMonthParams(html), current: parseCurrentYearMonth(html) };
		}
		const param = search.params.get(ym.slice(2));
		if (!param) throw new Error(`検索ページに ${ym} の照合値がありません`);
		const prefix = search.current && ym >= search.current ? 'pw01skl00' : 'pw01skl10';
		const html = await deps.post(`${prefix}${ym}/${param}`);
		const map = new Map<string, string>();
		for (const d of parseDayLinks(html)) map.set(`${d.date}-${d.courseCode}`, d.cname);
		months.set(ym, map);
		return map;
	}

	return async function records(date: string, course: string): Promise<JraRecordMark[] | null> {
		const code = COURSE_TO_CODE[course];
		if (!code) return null;
		const file = join(deps.cacheDir, `${date}-${course}.json`);
		try {
			return JSON.parse(await readFile(file, 'utf8')) as JraRecordMark[];
		} catch {
			// 初回は無い。
		}
		try {
			const dayCname = (await monthDays(date.slice(0, 4) + date.slice(5, 7))).get(
				`${date}-${code}`
			);
			if (!dayCname) {
				deps.warn(`! JRA の結果に ${date} ${course} がまだありません。レコードは書きません`);
				return null;
			}
			const ses = parseSesLink(await deps.post(dayCname));
			if (!ses) {
				deps.warn(
					`! JRA の ${date} ${course} に全レース結果のリンクがありません。レコードは書きません`
				);
				return null;
			}
			const parsed = parseRaceRecords(await deps.post(ses));
			if (parsed.races === 0) {
				deps.warn(`! JRA の ${date} ${course} の結果にレースがありません。レコードは書きません`);
				return null;
			}
			// 開催日の当日は、結果が出そろう前かもしれない（途中の開催を覚えると、あとのレコードを取りこぼす）。前の日までだけ覚える
			if (date < (deps.today ?? todayJst)()) {
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, JSON.stringify(parsed.marks), 'utf8');
			}
			return parsed.marks;
		} catch (e) {
			deps.warn(
				`! JRA の ${date} ${course} を取れませんでした。レコードは書きません: ${(e as Error).message}`
			);
			return null;
		}
	};
}

/** 実際に JRA へ取りに行く。 */
export const jraRecords = createJraRecords({
	post: postJra,
	cacheDir: DEFAULT_CACHE_DIR,
	warn: (m) => console.warn(m)
});
