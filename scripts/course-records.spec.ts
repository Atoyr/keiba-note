import { describe, expect, it } from 'vitest';
import { parseAsOf, parseRecordPage } from './course-records.ts';

const heading = (kind: 'turf' | 'dirt', cap: string, txt: string) =>
	`<h3><span class="inner"><span class="icon"><span class="${kind}"><span class="cap">${cap}</span>コース</span></span>
	<span class="txt">${txt}</span></span></h3>`;

const row = (dist: string, time: string, date: string) => `<tr>
  <th scope="row" rowspan="1">${dist}<span>左</span></th>
  <td class="time" rowspan="1">${time}</td>
  <td class="horse">ウマ</td>
  <td class="date" rowspan="1">${date}</br><span class="conditions">（晴・良）</span></td>
</tr>`;

describe('parseRecordPage', () => {
	it('芝・ダート・障害の見出しで馬場を決め、距離のカンマ・日付の0埋めを直す', () => {
		const html = [
			heading('turf', '芝', '3歳以上'),
			row('2,400', '2:20.3', '2025年<span>1月3日</span>'),
			heading('dirt', 'ダート', '2歳'),
			row('1,400', '1:21.0', '2020年<span>11月30日</span>'),
			heading('turf', '芝', '障害3歳以上'),
			row('3,000', '3:10.0', '2019年<span>5月6日</span>')
		].join('\n');
		expect(parseRecordPage(html, '東京')).toEqual([
			{ course: '東京', surface: '芝', distance: 2400, time: '2:20.3', date: '2025-01-03' },
			{ course: '東京', surface: 'ダート', distance: 1400, time: '1:21.0', date: '2020-11-30' },
			{ course: '東京', surface: '障害', distance: 3000, time: '3:10.0', date: '2019-05-06' }
		]);
	});

	it('1分未満のタイムはそのまま読む', () => {
		const html =
			heading('turf', '芝', '3歳以上') + row('1000', '56.5', '2026年<span>8月2日</span>');
		expect(parseRecordPage(html, '新潟')[0]).toMatchObject({ distance: 1000, time: '56.5' });
	});

	it('基準タイムの行は除く', () => {
		const html =
			heading('turf', '芝', '3歳以上') +
			row('2000', '2:03.9<span>基準</span>', '2024年<span>9月1日</span>') +
			row('2200', '2:10.0', '2024年<span>9月1日</span>');
		expect(parseRecordPage(html, '中京').map((r) => r.distance)).toEqual([2200]);
	});

	it('同着で後ろの行にセルが無いときは、その行を飛ばして1件にする', () => {
		const html =
			heading('turf', '芝', '3歳以上') +
			`<tr><th scope="row" rowspan="2">1,600<span>左</span></th><td class="time" rowspan="2">1:31.0</td><td class="horse">A</td><td class="date" rowspan="2">2021年<span>4月3日</span></td></tr>
			 <tr><td class="horse">B</td></tr>`;
		expect(parseRecordPage(html, '阪神')).toHaveLength(1);
	});
});

describe('parseAsOf', () => {
	it('終了現在の日付を読む', () => {
		expect(parseAsOf('<span>2026年1月5日終了現在</span>')).toBe('2026-01-05');
		expect(parseAsOf('なし')).toBeNull();
	});
});
