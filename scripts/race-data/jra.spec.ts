import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createJraRecords,
	parseCurrentYearMonth,
	parseDayLinks,
	parseMonthParams,
	parseRaceRecords,
	parseSesLink
} from './jra.ts';

/** 実物の全レース結果から、行を小さく切ったもの。 */
const row = (place: number, num: number, name: string, time: string, margin: string) => `
  <tr>
      <td class="place">${place}</td>
      <td class="waku"><img src="/JRADB/img/waku/8.png" alt="枠8桃" /></td>
      <td class="num">${num}</td>
      <td class="horse">
        <a href="/JRADB/accessU.html?CNAME=pw01dud102024101605/29">${name}</a></td>
      <td class="time">${time}</td>
      <td class="margin">
      ${margin}
        </td>
  </tr>`;
const RECORD = '<strong class="record">レコード</strong>';
const unit = (n: number, rows: string) =>
	`<div class="race_result_unit" id="race_result_${n}R"><table><tbody>${rows}</tbody></table></div>`;

describe('parseMonthParams / parseCurrentYearMonth', () => {
	const html = `var yearMonth = "202611"; var objParam = new Array();objParam["2511"]="EC";objParam["2512"]="BA";objParam["9901"]="CD";`;
	it('YYMM → 照合値の表にする', () => {
		const m = parseMonthParams(html);
		expect(m.get('2511')).toBe('EC');
		expect(m.get('9901')).toBe('CD');
		expect(m.size).toBe(3);
	});
	it('この月以降の境目を読む', () => {
		expect(parseCurrentYearMonth(html)).toBe('202611');
		expect(parseCurrentYearMonth('<html></html>')).toBeUndefined();
	});
});

describe('parseDayLinks / parseSesLink', () => {
	const month = `
	<a href="#" onclick="return doAction('/JRADB/accessS.html', 'pw01srl10052025041020251101/AA');">4回東京10日</a>
	<a href="#" onclick="return doAction('/JRADB/accessS.html', 'pw01srl10082025031020251101/57');">3回京都10日</a>
	<a href="#" onclick="return doAction('/JRADB/accessS.html', 'pw01srl10052025041020251101/AA');">again</a>`;
	it('開催日へのリンクを、場コード・日付・cname にする（重複は1つ）', () => {
		expect(parseDayLinks(month)).toEqual([
			{ courseCode: '05', date: '2025-11-01', cname: 'pw01srl10052025041020251101/AA' },
			{ courseCode: '08', date: '2025-11-01', cname: 'pw01srl10082025031020251101/57' }
		]);
		expect(parseDayLinks('<html></html>')).toEqual([]);
	});
	it('開催日のページから全レース結果のリンクを取る', () => {
		const day = `<a onclick="return doAction('/JRADB/accessS.html', 'pw01ses10052025050820251130/39');">全てのレースを表示</a>`;
		expect(parseSesLink(day)).toBe('pw01ses10052025050820251130/39');
		expect(parseSesLink('<html></html>')).toBeUndefined();
	});
});

describe('parseRaceRecords', () => {
	it('着差の欄にレコードのある行だけを、レースごとに返す', () => {
		const html =
			unit(
				1,
				row(1, 15, 'ネージュドレーヴ', '1:44.6', RECORD) + row(2, 3, 'セイウン', '1:44.9', '1')
			) +
			unit(2, row(1, 4, 'ホースB', '1:12.0', '')) +
			unit(3, row(1, 7, 'ホースC', '1:43.9', RECORD));
		expect(parseRaceRecords(html)).toEqual({
			races: 3,
			marks: [
				{ raceNumber: 1, horseNumber: 15, name: 'ネージュドレーヴ', time: '1:44.6' },
				{ raceNumber: 3, horseNumber: 7, name: 'ホースC', time: '1:43.9' }
			]
		});
	});

	it('同タイムの2着（着差がアタマ）には付けない', () => {
		const html = unit(
			12,
			row(1, 2, 'ホースA', '2:20.3', RECORD) + row(2, 9, 'ホースD', '2:20.3', 'アタマ')
		);
		const { marks } = parseRaceRecords(html);
		expect(marks.map((m) => m.horseNumber)).toEqual([2]);
	});

	it('同じ日に2回破られれば、両方のレースに付く', () => {
		const html =
			unit(5, row(1, 1, 'ホースA', '1:44.6', RECORD)) +
			unit(9, row(1, 2, 'ホースB', '1:43.9', RECORD));
		expect(parseRaceRecords(html).marks.map((m) => [m.raceNumber, m.time])).toEqual([
			[5, '1:44.6'],
			[9, '1:43.9']
		]);
	});

	it('レースが無いページは races 0（結果が出る前）', () => {
		expect(parseRaceRecords('<html></html>')).toEqual({ races: 0, marks: [] });
	});
});

describe('createJraRecords', () => {
	const search = `var yearMonth = "202612"; objParam["2511"]="EC";`;
	const month = `<a onclick="doAction('/JRADB/accessS.html', 'pw01srl10052025041020251130/AA');">x</a>`;
	const day = `<a onclick="doAction('/JRADB/accessS.html', 'pw01ses10052025050820251130/39');">x</a>`;
	const ses = unit(12, row(1, 2, 'ホースA', '2:20.3', RECORD));

	function setup(pages: Record<string, string>) {
		const calls: string[] = [];
		const warns: string[] = [];
		return {
			calls,
			warns,
			make: async () =>
				createJraRecords({
					post: async (cname) => {
						calls.push(cname);
						if (!(cname in pages)) throw new Error(`no page ${cname}`);
						return pages[cname];
					},
					cacheDir: await mkdtemp(join(tmpdir(), 'jra-')),
					warn: (m) => warns.push(m),
					today: () => '2099-01-01'
				})
		};
	}
	const pages = {
		'pw01skl00999999/B3': search,
		'pw01skl10202511/EC': month,
		'pw01srl10052025041020251130/AA': day,
		'pw01ses10052025050820251130/39': ses
	};

	it('検索 → 月 → 開催日 → 全レース結果とたどり、結果を覚える（2回目は取りに行かない）', async () => {
		const s = setup(pages);
		const records = await s.make();
		const marks = await records('2025-11-30', '東京');
		expect(marks).toEqual([{ raceNumber: 12, horseNumber: 2, name: 'ホースA', time: '2:20.3' }]);
		expect(s.calls).toEqual([
			'pw01skl00999999/B3',
			'pw01skl10202511/EC',
			'pw01srl10052025041020251130/AA',
			'pw01ses10052025050820251130/39'
		]);
		await records('2025-11-30', '東京');
		expect(s.calls.length).toBe(4);
	});

	it('結果の覚え書きをファイルに書く', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'jra-'));
		const records = createJraRecords({
			post: async (c) => pages[c as keyof typeof pages],
			cacheDir: dir,
			warn: () => {},
			today: () => '2025-12-01'
		});
		await records('2025-11-30', '東京');
		expect(await readdir(dir)).toEqual(['2025-11-30-東京.json']);
		expect(JSON.parse(await readFile(join(dir, '2025-11-30-東京.json'), 'utf8'))).toHaveLength(1);
	});

	it('開催日が今日以降なら覚えない（途中の開催を覚えない）', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'jra-'));
		const calls: string[] = [];
		const records = createJraRecords({
			post: async (c) => {
				calls.push(c);
				return pages[c as keyof typeof pages];
			},
			cacheDir: dir,
			warn: () => {},
			today: () => '2025-11-30'
		});
		expect(await records('2025-11-30', '東京')).toHaveLength(1);
		expect(await readdir(dir)).toEqual([]);
		await records('2025-11-30', '東京');
		expect(calls.filter((c) => c.startsWith('pw01ses')).length).toBe(2);
	});

	it('その日のリンクが月のページに無いときは、警告を出して null（覚えない）', async () => {
		const s = setup({ ...pages, 'pw01skl10202511/EC': '<html></html>' });
		const records = await s.make();
		expect(await records('2025-11-30', '東京')).toBeNull();
		expect(s.warns[0]).toContain('まだありません');
	});

	it('結果のページにレースが無いときは null（覚えない）', async () => {
		const s = setup({ ...pages, 'pw01ses10052025050820251130/39': '<html></html>' });
		const records = await s.make();
		expect(await records('2025-11-30', '東京')).toBeNull();
		expect(await records('2025-11-30', '東京')).toBeNull();
		expect(s.calls.filter((c) => c.startsWith('pw01ses')).length).toBe(2);
	});

	it('JRA が落ちているときは、警告を出して null', async () => {
		const s = setup({});
		const records = await s.make();
		expect(await records('2025-11-30', '東京')).toBeNull();
		expect(s.warns[0]).toContain('取れませんでした');
	});
});
