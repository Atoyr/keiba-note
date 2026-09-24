/**
 * netkeiba のページを取ってきて、data/races/*.yaml に書ける形へ読み替える。
 *
 * **読み替えはここに閉じる。** HTML の構造が変わったときに直すのはこのファイルだけで、
 * YAML への書き込み（yaml-file.ts）や手順（scripts/race-data.ts）は触らずに済む。
 *
 * 取り方の約束:
 * - 1リクエストごとに間を空ける（既定 1秒、`setRequestInterval` で 0.5秒まで縮められる）。まとめて叩かない
 * - HTML は正規表現で切り出す。依存を増やさないためで、壊れたら**黙って空を返さず**
 *   呼び出し側が「0頭」「見つからない」と気づける形で返す
 */

import type { COURSES } from '../../src/lib/schemas/race.ts';

export type Course = (typeof COURSES)[number];
export type Grade = 'G1' | 'G2' | 'G3' | 'L' | 'OP';
export type Surface = '芝' | 'ダート' | '障害';
export type Direction = '右' | '左' | '直線';
export type TrackCondition = '良' | '稍重' | '重' | '不良';

/** race_id の3〜4桁目。netkeiba と JRA で共通の場コード。 */
export const COURSE_CODES: Record<string, Course> = {
	'01': '札幌',
	'02': '函館',
	'03': '福島',
	'04': '新潟',
	'05': '東京',
	'06': '中山',
	'07': '中京',
	'08': '京都',
	'09': '阪神',
	'10': '小倉'
};

const COURSE_NAMES = Object.values(COURSE_CODES);

// ---------------------------------------------------------------------------
// 取得
// ---------------------------------------------------------------------------

/** 既定の間隔。`setRequestInterval` で変えられるが、`MIN_REQUEST_INTERVAL_MS` より短くはしない。 */
export const DEFAULT_REQUEST_INTERVAL_MS = 1000;
export const MIN_REQUEST_INTERVAL_MS = 500;
let requestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS;
const USER_AGENT = 'Mozilla/5.0 (uma-memo data entry; personal use)';
let lastRequestAt = 0;

/** リクエストの間隔（ミリ秒）を変える。`MIN_REQUEST_INTERVAL_MS` 未満は受け付けない。 */
export function setRequestInterval(ms: number): void {
	if (!Number.isFinite(ms) || ms < MIN_REQUEST_INTERVAL_MS) {
		throw new RangeError(`取得の間隔は ${MIN_REQUEST_INTERVAL_MS}ms 以上にしてください: ${ms}`);
	}
	requestIntervalMs = ms;
}

/**
 * ページを取って文字列で返す。db.netkeiba.com は EUC-JP、race.netkeiba.com は UTF-8 なので、
 * ヘッダか meta の charset を見てデコードする。
 */
export async function fetchPage(url: string): Promise<string> {
	const wait = lastRequestAt + requestIntervalMs - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();

	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);

	const buf = new Uint8Array(await res.arrayBuffer());
	const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
	const charset =
		/charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ??
		/charset=["']?([\w-]+)/i.exec(head)?.[1] ??
		'utf-8';
	return new TextDecoder(charset.toLowerCase()).decode(buf);
}

export const urls = {
	raceList: (date: string) =>
		`https://race.netkeiba.com/top/race_list_sub.html?kaisai_date=${date.replaceAll('-', '')}`,
	shutuba: (raceId: string) => `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`,
	result: (raceId: string) => `https://race.netkeiba.com/race/result.html?race_id=${raceId}`,
	horse: (horseId: string) => `https://db.netkeiba.com/horse/${horseId}/`,
	horseResults: (horseId: string) => `https://db.netkeiba.com/horse/result/${horseId}/`,
	pedigree: (horseId: string) =>
		`https://db.netkeiba.com/horse/ajax_horse_pedigree.html?input=UTF-8&output=json&id=${horseId}`,
	jockey: (id: string) => `https://db.netkeiba.com/jockey/${id}/`,
	trainer: (id: string) => `https://db.netkeiba.com/trainer/${id}/`
};

// ---------------------------------------------------------------------------
// 文字列の下ごしらえ
// ---------------------------------------------------------------------------

/** タグを外し、実体参照を戻し、空白を1つに詰める。 */
export function text(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * 全角の英数字と記号の一部を半角に寄せる。`スプリンターズＳ` → `スプリンターズS`、
 * `Ｃ．ルメール` → `C.ルメール`。括弧は JRA の表記（`天皇賞（秋）`）を崩さないよう触らない。
 */
export function toHalfWidth(s: string): string {
	return s
		.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
		.replace(/．/g, '.')
		.replace(/\u3000/g, ' ')
		.trim();
}

/** netkeiba の ID を YAML の `ref` に。既存データに合わせて `nk-` を付ける。 */
export const toRef = (horseId: string) => `nk-${horseId}`;
export const fromRef = (ref: string) => (ref.startsWith('nk-') ? ref.slice(3) : null);

function num(s: string | undefined): number | undefined {
	if (s === undefined) return undefined;
	const n = Number(s.trim());
	return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

function int(s: string | undefined): number | undefined {
	const n = num(s);
	return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** `<td ...>...</td>` を順に切り出す。入れ子の td は無い前提（netkeiba の表には無い）。 */
function cells(rowHtml: string): string[] {
	return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[0]);
}

/** `class="Shutuba_Table ..."` のように開始タグの印から、最初の `</table>` までを返す。 */
function tableAfter(html: string, marker: string): string | null {
	const start = html.indexOf(marker);
	if (start < 0) return null;
	const end = html.indexOf('</table>', start);
	return html.slice(start, end < 0 ? undefined : end);
}

/** `牡5` → 性と馬齢。 */
export function parseSexAge(s: string): { sex?: '牡' | '牝' | 'セ'; age?: number } {
	const m = /(牡|牝|セ|騸)\s*(\d+)/.exec(s);
	if (!m) return {};
	return { sex: m[1] === '騸' ? 'セ' : (m[1] as '牡' | '牝' | 'セ'), age: Number(m[2]) };
}

/** `472(-10)` → 馬体重と増減。`計不` や空欄なら何も返さない。 */
export function parseHorseWeight(s: string): { horseWeight?: number; horseWeightDiff?: number } {
	const m = /(\d{3})\s*\(\s*([+-]?\d+)\s*\)/.exec(text(s));
	if (m) return { horseWeight: Number(m[1]), horseWeightDiff: Number(m[2]) };
	const only = /(\d{3})/.exec(text(s));
	return only ? { horseWeight: Number(only[1]) } : {};
}

const GRADE_WORDS: Record<string, Grade> = {
	G1: 'G1',
	G2: 'G2',
	G3: 'G3',
	GI: 'G1',
	GII: 'G2',
	GIII: 'G3',
	'J.G1': 'G1',
	'J.G2': 'G2',
	'J.G3': 'G3',
	'J.GI': 'G1',
	'J.GII': 'G2',
	'J.GIII': 'G3',
	// netkeiba の障害重賞は点が無い（`中山グランドジャンプ(JG1)`・`新潟ジャンプS(JGIII)`）
	JG1: 'G1',
	JG2: 'G2',
	JG3: 'G3',
	JGI: 'G1',
	JGII: 'G2',
	JGIII: 'G3',
	L: 'L',
	OP: 'OP'
};

/** 条件戦のクラス。レース名や条件の表記から拾う。 */
const CLASS_PATTERNS: [RegExp, string][] = [
	[/新馬/, '新馬'],
	[/未勝利/, '未勝利'],
	[/1勝クラス|\(1勝\)|500万/, '1勝クラス'],
	[/2勝クラス|\(2勝\)|1000万/, '2勝クラス'],
	[/3勝クラス|\(3勝\)|1600万/, '3勝クラス']
];

/**
 * netkeiba のレース名を YAML の `name` / `grade` / `className` に分ける。
 *
 * - `産経賞オールカマー(GII)` → name `産経賞オールカマー`・grade `G2`
 * - `木更津特別(2勝)` → name `木更津特別`・className `2勝クラス`
 * - `3歳以上1勝クラス` → name そのまま・className `1勝クラス`
 * - `天皇賞(秋)(GI)` → name `天皇賞（秋）`・grade `G1`
 *
 * 冠（`産経賞` 等）は機械的には外せないので残す。既に YAML にあるレースは名前を書き換えない。
 */
export function splitRaceName(raw: string): { name: string; grade?: Grade; className?: string } {
	const s = toHalfWidth(raw).trim();
	const paren = /\(([^()]+)\)\s*$/.exec(s);
	let name = s;
	let grade: Grade | undefined;
	if (paren && GRADE_WORDS[paren[1]]) {
		grade = GRADE_WORDS[paren[1]];
		name = s.slice(0, paren.index).trim();
	}
	let className: string | undefined;
	if (!grade) {
		className = CLASS_PATTERNS.find(([re]) => re.test(s))?.[1];
		if (className && paren && /勝|新馬|未勝利/.test(paren[1]))
			name = s.slice(0, paren.index).trim();
	}
	// 戦績表は `天皇賞(秋)` と半角で書く。出馬表と JRA の表記（`天皇賞（秋）`）に揃える。
	name = name.replace(/ステークス$/, 'S').replace(/\((春|秋)\)$/, '（$1）');
	return { name, grade, className };
}

/** `芝1200` / `ダ1800` / `障3000` → 芝ダと距離。 */
export function parseSurfaceDistance(s: string): { surface?: Surface; distance?: number } {
	const m = /(芝|ダ|障)\D*?(\d{3,4})/.exec(s);
	if (!m) return {};
	const surface: Surface = m[1] === '芝' ? '芝' : m[1] === 'ダ' ? 'ダート' : '障害';
	return { surface, distance: Number(m[2]) };
}

/**
 * 回りを場と芝ダから決める。過去走（馬の戦績表）には回りが載っていないため。
 * 障害は周回で内外・回りが入り組むので決めない。
 */
export function directionOf(
	course: Course,
	surface?: Surface,
	distance?: number
): Direction | undefined {
	if (!surface || surface === '障害') return undefined;
	if (course === '新潟' && surface === '芝' && distance === 1000) return '直線';
	return course === '東京' || course === '新潟' || course === '中京' ? '左' : '右';
}

/** `稍` `不` のような1文字表記も受ける。 */
export function parseTrackCondition(s: string): TrackCondition | undefined {
	const t = s.trim();
	if (t.startsWith('稍')) return '稍重';
	if (t.startsWith('不')) return '不良';
	if (t.startsWith('重')) return '重';
	if (t.startsWith('良')) return '良';
	return undefined;
}

// ---------------------------------------------------------------------------
// 開催日のレース一覧
// ---------------------------------------------------------------------------

export type RaceListItem = { raceId: string; course: Course; raceNumber: number; title: string };

/** race_list_sub.html から、その日の JRA のレースを返す。 */
export function parseRaceList(html: string): RaceListItem[] {
	const seen = new Set<string>();
	const out: RaceListItem[] = [];
	for (const m of html.matchAll(/<li class="RaceList_DataItem[\s\S]*?<\/li>/g)) {
		const li = m[0];
		const raceId = /race_id=(\d{12})/.exec(li)?.[1];
		if (!raceId || seen.has(raceId)) continue;
		const course = COURSE_CODES[raceId.slice(4, 6)];
		if (!course) continue;
		seen.add(raceId);
		out.push({
			raceId,
			course,
			raceNumber: Number(raceId.slice(10, 12)),
			title: text(/<span class="ItemTitle">([\s\S]*?)<\/span>/.exec(li)?.[1] ?? '')
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// 出馬表（枠が決まる前は登録馬）
// ---------------------------------------------------------------------------

export type RaceMeta = {
	/** ページの title にある開催日（`YYYY-MM-DD`）。過去走の meta には無い。 */
	date?: string;
	name: string;
	grade?: Grade;
	className?: string;
	surface?: Surface;
	distance?: number;
	direction?: Direction;
	trackCondition?: TrackCondition;
	weather?: string;
	/** 発走時刻 `HH:MM`。出馬表の `15:40発走`。オッズを取りに行く時間帯を決める。 */
	startTime?: string;
};

export type Person = { id: string; short: string };

export type ShutubaRow = {
	bracket?: number;
	horseNumber?: number;
	name: string;
	horseId: string;
	sex?: '牡' | '牝' | 'セ';
	age?: number;
	weight?: number;
	jockey?: Person;
	trainer?: Person;
};

/** ページの title と RaceData01/02 からレースの属性を読む。出馬表と結果で共通。 */
export function parseRaceMeta(html: string): RaceMeta {
	const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
	const rawName = title.replace(/\s*(出馬表|結果・払戻|結果)[\s\S]*$/, '').trim();
	const { name, grade } = splitRaceName(rawName);
	const ymd = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(title);
	const date = ymd ? `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}` : undefined;

	const data01 = text(/class="RaceData01"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '');
	const data02 = toHalfWidth(
		text(/class="RaceData02"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '')
	);

	const { surface, distance } = parseSurfaceDistance(data01);
	const dir = /\((右|左|直線|直)/.exec(data01)?.[1];
	const start = /(\d{1,2}):(\d{2})発走/.exec(data01);
	const direction: Direction | undefined = dir === '直' ? '直線' : (dir as Direction | undefined);

	let className: string | undefined;
	let finalGrade = grade;
	if (!grade) {
		className = CLASS_PATTERNS.find(([re]) => re.test(data02))?.[1];
		// 格の札が無いオープンは OP として扱う（既存データと同じ）。
		if (!className && /オープン/.test(data02)) finalGrade = 'OP';
	}

	return {
		date,
		name,
		grade: finalGrade,
		className,
		surface,
		distance,
		direction,
		trackCondition: parseTrackCondition(/馬場:\s*(\S+)/.exec(data01)?.[1] ?? ''),
		weather: /天候:\s*(\S+)/.exec(data01)?.[1],
		startTime: start ? `${start[1].padStart(2, '0')}:${start[2]}` : undefined
	};
}

function person(cell: string | undefined, kind: 'jockey' | 'trainer'): Person | undefined {
	if (!cell) return undefined;
	const id = new RegExp(`/${kind}/(?:result/recent/)?(\\w+)/`).exec(cell)?.[1];
	const short = toHalfWidth(text(cell).replace(/^(美浦|栗東|地方|海外)\s*/, ''));
	return id && short ? { id, short } : undefined;
}

/**
 * 出馬表。枠が決まる前は枠・馬番が空欄の登録馬が並ぶ（18頭を超えることもある）。
 */
export function parseShutuba(html: string): { meta: RaceMeta; rows: ShutubaRow[] } {
	const table = tableAfter(html, 'ShutubaTable') ?? '';
	const rows: ShutubaRow[] = [];
	const seen = new Set<string>();

	for (const m of table.matchAll(/<tr\s+class="HorseList[^"]*"[\s\S]*?<\/tr>/g)) {
		const tr = m[0].replace(/<select[\s\S]*?<\/select>/g, '');
		const link = /db\.netkeiba\.com\/horse\/(\d+)"[^>]*title="([^"]*)"/.exec(tr);
		if (!link || seen.has(link[1])) continue;
		seen.add(link[1]);

		const tds = cells(tr);
		const baIdx = tds.findIndex((td) => /class="Barei/.test(td));
		rows.push({
			bracket: int(text(tds.find((td) => /class="Waku/.test(td)) ?? '')),
			horseNumber: int(text(tds.find((td) => /class="Umaban/.test(td)) ?? '')),
			name: link[2].trim(),
			horseId: link[1],
			...parseSexAge(text(tds[baIdx] ?? '')),
			// 斤量は性齢の次の列。枠が決まる前から出ている。
			weight: baIdx >= 0 ? num(text(tds[baIdx + 1] ?? '')) : undefined,
			jockey: person(
				tds.find((td) => /class="Jockey/.test(td)),
				'jockey'
			),
			trainer: person(
				tds.find((td) => /class="Trainer/.test(td)),
				'trainer'
			)
		});
	}
	return { meta: parseRaceMeta(html), rows };
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------

/**
 * 上がり3F。**障害は読まない。** netkeiba の障害の「上り」は1Fあたりの平均（13秒台）で、
 * 平地の上がり3Fと並べられず、`last3f` の範囲（20〜60秒）にも入らない。
 */
function last3fOf(surface: Surface | undefined, cell: string | undefined): number | undefined {
	return surface === '障害' ? undefined : num(text(cell ?? ''));
}

export type ResultRow = {
	/** 着順。取消・除外・中止・失格なら undefined で、`status` に理由が入る。 */
	finish?: number;
	status?: string;
	bracket?: number;
	horseNumber?: number;
	name: string;
	horseId: string;
	sex?: '牡' | '牝' | 'セ';
	age?: number;
	weight?: number;
	jockey?: Person;
	time?: string;
	margin?: string;
	popularity?: number;
	odds?: number;
	last3f?: number;
	passing?: string;
	horseWeight?: number;
	horseWeightDiff?: number;
};

export function parseResult(html: string): { meta: RaceMeta; rows: ResultRow[] } {
	const table = tableAfter(html, 'id="All_Result_Table"') ?? '';
	const rows: ResultRow[] = [];
	const meta = parseRaceMeta(html);

	// 結果の表は `<tr  class=...` と空白が2つ入る。
	for (const m of table.matchAll(/<tr\s+class="[^"]*HorseList[^"]*"[\s\S]*?<\/tr>/g)) {
		const tr = m[0];
		const link = /db\.netkeiba\.com\/horse\/(\d+)"[^>]*title="([^"]*)"/.exec(tr);
		if (!link) continue;
		const tds = cells(tr);
		// 列: 着順 / 枠 / 馬番 / 馬名 / 性齢 / 斤量 / 騎手 / タイム / 着差 / 人気 / 単勝 / 後3F / 通過 / 厩舎 / 馬体重
		const rank = text(tds[0] ?? '');
		const finish = int(/^\d+/.exec(rank)?.[0]);
		const margin = text(tds[8] ?? '');
		rows.push({
			finish,
			status: finish === undefined && rank ? rank : undefined,
			bracket: int(text(tds[1] ?? '')),
			horseNumber: int(text(tds[2] ?? '')),
			name: link[2].trim(),
			horseId: link[1],
			...parseSexAge(text(tds[4] ?? '')),
			weight: num(text(tds[5] ?? '')),
			jockey: person(tds[6], 'jockey'),
			time: text(tds[7] ?? '') || undefined,
			margin: margin || undefined,
			popularity: int(text(tds[9] ?? '')),
			odds: num(text(tds[10] ?? '')),
			last3f: last3fOf(meta.surface, tds[11]),
			passing: text(tds[12] ?? '') || undefined,
			...parseHorseWeight(tds[14] ?? '')
		});
	}
	return { meta, rows };
}

// ---------------------------------------------------------------------------
// 馬の戦績（過去走）
// ---------------------------------------------------------------------------

export type PastRun = {
	date: string;
	course: Course;
	raceNumber: number;
	raceId?: string;
	race: RaceMeta;
	bracket?: number;
	horseNumber?: number;
	odds?: number;
	popularity?: number;
	finish?: number;
	/** 着順が数字でないときの表記（`取` `除` `中` など）。 */
	status?: string;
	/** 戦績表の騎手名。4文字で切れている（`佐々木大`）ので、`jockeyId` があれば引き直す。 */
	jockey?: string;
	jockeyId?: string;
	weight?: number;
	time?: string;
	passing?: string;
	last3f?: number;
	horseWeight?: number;
	horseWeightDiff?: number;
};

/**
 * db.netkeiba.com/horse/result/<id>/ の戦績表。新しい順に並んでいる。
 *
 * **JRA の10場以外（地方・海外）は返さない。** YAML の競馬場が10場しか受け付けないため。
 * 列は見出しの文字で引く（位置で引くと、有料列の出し入れで簡単にずれる）。
 */
export function parseHorseResults(html: string): PastRun[] {
	const table = tableAfter(html, 'db_h_race_results') ?? '';
	const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
		text(m[1]).replace(/\s/g, '')
	);
	const col = (name: string) => headers.indexOf(name);
	const at = (tds: string[], name: string) => (col(name) >= 0 ? (tds[col(name)] ?? '') : '');

	const body = table.slice(table.indexOf('<tbody'));
	const out: PastRun[] = [];

	for (const m of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
		const tds = cells(m[1]);
		if (tds.length < 10) continue;

		const date = text(at(tds, '日付')).replaceAll('/', '-');
		const kaisai = text(at(tds, '開催'));
		const course = COURSE_NAMES.find((c) => new RegExp(`^\\d*${c}\\d*$`).test(kaisai));
		if (!course || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

		const raceCell = at(tds, 'レース名');
		const raceId = /\/race\/(\d{12})\//.exec(raceCell)?.[1];
		const { name, grade, className } = splitRaceName(text(raceCell));
		const { surface, distance } = parseSurfaceDistance(text(at(tds, '距離')));
		const finishText = text(at(tds, '着順'));
		const finish = int(/^\d+/.exec(finishText)?.[0]);

		out.push({
			date,
			course,
			raceNumber: int(text(at(tds, 'R'))) ?? Number(raceId?.slice(10, 12)),
			raceId,
			race: {
				name,
				grade,
				className,
				surface,
				distance,
				direction: directionOf(course, surface, distance),
				trackCondition: parseTrackCondition(text(at(tds, '馬場'))),
				weather: text(at(tds, '天気')) || undefined
			},
			bracket: int(text(at(tds, '枠番'))),
			horseNumber: int(text(at(tds, '馬番'))),
			odds: num(text(at(tds, 'オッズ'))),
			popularity: int(text(at(tds, '人気'))),
			finish,
			status: finish === undefined && finishText ? finishText : undefined,
			jockey: toHalfWidth(text(at(tds, '騎手'))) || undefined,
			jockeyId: person(at(tds, '騎手'), 'jockey')?.id,
			weight: num(text(at(tds, '斤量'))),
			time: text(at(tds, 'タイム')) || undefined,
			passing: text(at(tds, '通過')) || undefined,
			last3f: last3fOf(surface, at(tds, '上り')),
			...parseHorseWeight(at(tds, '馬体重'))
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// 馬の基本情報
// ---------------------------------------------------------------------------

export type HorseProfile = {
	name: string;
	sex?: '牡' | '牝' | 'セ';
	birthYear?: number;
	/** プロフィール表の調教師名。4文字で切れる（`中内田充`）ので、`trainerId` があれば引き直す。 */
	trainer?: string;
	trainerId?: string;
	sire?: string;
	dam?: string;
};

/** db.netkeiba.com/horse/<id>/ の見出しとプロフィール表。 */
export function parseHorseProfile(html: string): HorseProfile {
	const titleBox = /class="horse_title"[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
	const name = text(/<h1>([\s\S]*?)<\/h1>/.exec(titleBox)?.[1] ?? '');
	const status = text(/class="txt_01">([\s\S]*?)<\/p>/.exec(titleBox)?.[1] ?? '');
	const sexWord = /(牡|牝|セ|騸)/.exec(status)?.[1];

	const profHtml = /class="db_prof_table[\s\S]*?<\/table>/.exec(html)?.[0] ?? '';
	const prof = text(profHtml);
	const birthYear = int(/生年月日\s*(\d{4})年/.exec(prof)?.[1]);
	const trainer = /調教師\s*(\S+?)\s*\(/.exec(prof)?.[1];
	const trainerId = /調教師[\s\S]*?\/trainer\/(?:result\/recent\/)?(\w+)\//.exec(profHtml)?.[1];

	return {
		name,
		sex: sexWord === '騸' ? 'セ' : (sexWord as HorseProfile['sex']),
		birthYear,
		trainer: trainer && trainer !== '-' ? toHalfWidth(trainer) : undefined,
		trainerId: trainer && trainer !== '-' ? trainerId : undefined
	};
}

/** 血統の ajax（`{ status, data }`）の data。1代目の父と母だけ読む。 */
export function parsePedigree(html: string): { sire?: string; dam?: string } {
	const table = tableAfter(html, 'blood_table') ?? '';
	const firstGen = [...table.matchAll(/<td rowspan="2"[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
		text(m[1])
	);
	return { sire: firstGen[0] || undefined, dam: firstGen[1] || undefined };
}

/** 騎手・調教師のプロフィールページの title から、略さない名前を読む。 */
export function parsePersonName(html: string): string | undefined {
	const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
	const name = /^(.+?)のプロフィール/.exec(title)?.[1];
	return name ? toHalfWidth(name) : undefined;
}
