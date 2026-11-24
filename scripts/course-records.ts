/**
 * JRA の「中央競馬レコードタイム表」（競馬場別）を取って、`src/lib/utils/course-records-data.ts` を書き出す。
 *
 *   pnpm run course-records
 *
 * 馬柱のタイムをレコードのとき黒地白文字にするための表（`src/lib/utils/course-records.ts`）の元。
 * 表は「いまのレコード」だけ。人が回すか、人に頼まれたときにエージェントが回す。関係の無い PR では回さない
 * （JRA へ10回取りに行き、生成物に差分が出るため）。1件も取れない場・`終了現在` が読めないときは
 * 書かずに失敗で終わる（壊れた表で上書きしない）。
 */
import { writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { pathToFileURL } from 'node:url';

export type RecordRow = {
	course: string;
	surface: '芝' | 'ダート' | '障害';
	distance: number;
	/** `1:58.4` / `56.5`（JRA の表記のまま） */
	time: string;
	/** `2025-11-30` */
	date: string;
};

export const OUTPUT_PATH = 'src/lib/utils/course-records-data.ts';
const ENDPOINT = 'https://www.jra.go.jp/JRADB/accessW.html';
const USER_AGENT = 'Mozilla/5.0 (uma-memo data entry; personal use)';
const INTERVAL_MS = 1000;

/** 場ごとの `cname`（固定）。 */
export const COURSE_CNAMES: [string, string][] = [
	['札幌', 'pr09rtr0001/B4'],
	['函館', 'pr09rtr0002/FE'],
	['福島', 'pr09rtr0003/48'],
	['新潟', 'pr09rtr0004/92'],
	['東京', 'pr09rtr0005/DC'],
	['中山', 'pr09rtr0006/26'],
	['中京', 'pr09rtr0007/70'],
	['京都', 'pr09rtr0008/BA'],
	['阪神', 'pr09rtr0009/04'],
	['小倉', 'pr09rtr0010/93']
];

const pad = (n: string) => n.padStart(2, '0');

/** ページの `2026年11月23日終了現在` を `2026-11-23` で返す。無ければ null。 */
export function parseAsOf(html: string): string | null {
	const m = /(\d{4})年(\d{1,2})月(\d{1,2})日終了現在/.exec(html);
	return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
}

/** 1つの場のページから、レコードの行を取り出す。基準タイムは除く。 */
export function parseRecordPage(html: string, course: string): RecordRow[] {
	const rows: RecordRow[] = [];
	// 見出し（h3）で表を分ける。
	const parts = html.split(/<h3>/).slice(1);
	for (const part of parts) {
		const head =
			/<span class="icon"><span class="(turf|dirt)">[\s\S]*?<span class="txt">([^<]*)<\/span>/.exec(
				part
			);
		if (!head) continue;
		const surface: RecordRow['surface'] = head[2].trim().startsWith('障害')
			? '障害'
			: head[1] === 'turf'
				? '芝'
				: 'ダート';
		for (const tr of part.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
			const dist = /<th scope="row"[^>]*>\s*([\d,]+)/.exec(tr);
			const time = /<td class="time"[^>]*>([^<]*)(<span[^>]*>([^<]*)<\/span>)?/.exec(tr);
			const date = /<td class="date"[^>]*>\s*(\d{4})年<span>(\d{1,2})月(\d{1,2})日<\/span>/.exec(
				tr
			);
			if (!dist || !time || !date) continue; // 同着の後ろの行（セルが無い）や見出し行。前の行と同じレコードなので飛ばす
			if (time[3]?.includes('基準')) continue;
			rows.push({
				course,
				surface,
				distance: Number(dist[1].replaceAll(',', '')),
				time: time[1].trim(),
				date: `${date[1]}-${pad(date[2])}-${pad(date[3])}`
			});
		}
	}
	return rows;
}

const SURFACE_ORDER = ['芝', 'ダート', '障害'];

export function sortRows(rows: RecordRow[]): RecordRow[] {
	const courseOrder = COURSE_CNAMES.map(([c]) => c);
	return [...rows].sort(
		(a, b) =>
			courseOrder.indexOf(a.course) - courseOrder.indexOf(b.course) ||
			SURFACE_ORDER.indexOf(a.surface) - SURFACE_ORDER.indexOf(b.surface) ||
			a.distance - b.distance
	);
}

export function renderData(rows: RecordRow[], asOf: string): string {
	const lines = sortRows(rows).map(
		(r) =>
			`\t{ course: '${r.course}', surface: '${r.surface}', distance: ${r.distance}, time: '${r.time}', date: '${r.date}' }`
	);
	return `// \`pnpm run course-records\` が書く。手で直さない。
// 取得元: JRA「中央競馬レコードタイム表」（https://www.jra.go.jp/JRADB/accessW.html、競馬場別）。基準タイムは含めない。
// ${asOf} 終了現在。

export const COURSE_RECORDS_AS_OF = '${asOf}';

export const COURSE_RECORDS: {
	course: string;
	surface: string;
	distance: number;
	time: string;
	date: string;
}[] = [
${lines.join(',\n')}
];
`;
}

async function fetchPage(cname: string): Promise<string> {
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
		body: `cname=${cname}`
	});
	if (!res.ok) throw new Error(`JRA の応答が ${res.status} でした（${cname}）`);
	return new TextDecoder('shift_jis').decode(await res.arrayBuffer());
}

async function main() {
	const all: RecordRow[] = [];
	let asOf: string | null = null;
	for (const [i, [course, cname]] of COURSE_CNAMES.entries()) {
		if (i > 0) await new Promise((r) => setTimeout(r, INTERVAL_MS));
		const html = await fetchPage(cname);
		const rows = parseRecordPage(html, course);
		if (rows.length === 0)
			throw new Error(`${course} のレコードが1件も取れませんでした。書きません`);
		const page = parseAsOf(html);
		if (!page) throw new Error(`${course} の「終了現在」が読めませんでした。書きません`);
		if (!asOf || page > asOf) asOf = page;
		all.push(...rows);
		console.log(`${course}: ${rows.length}件`);
	}
	// lint（prettier --check）と同じ整形にして書く。回し直しても、レコードが変わった行だけが差分になる。
	const options = await resolveConfig(OUTPUT_PATH);
	await writeFile(
		OUTPUT_PATH,
		await format(renderData(all, asOf!), { ...options, filepath: OUTPUT_PATH })
	);
	console.log(`${all.length}件を ${OUTPUT_PATH} に書き出しました（${asOf} 終了現在）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
