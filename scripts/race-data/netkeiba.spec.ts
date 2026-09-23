import { describe, expect, it } from 'vitest';
import {
	directionOf,
	parseHorseProfile,
	parseHorseResults,
	parseHorseWeight,
	parsePedigree,
	parsePersonName,
	parseRaceList,
	parseResult,
	parseSexAge,
	parseShutuba,
	parseTrackCondition,
	setRequestInterval,
	splitRaceName,
	toHalfWidth
} from './netkeiba.ts';

// netkeiba のページを、パーサが見る部分だけに削った形で書く。実ページの構造に合わせてある。

const raceData = (data01: string, data02: string) =>
	`<div class="RaceData01">${data01}</div><div class="RaceData02">${data02}</div>`;

function shutubaRow(o: {
	waku?: number;
	umaban?: number;
	id: string;
	name: string;
	barei: string;
	kinryo: string;
	jockey?: [string, string];
	trainer: [string, string];
}) {
	return `<tr class="HorseList" id="tr_1">
<td class="Waku${o.waku ?? ''} Txt_C"><span>${o.waku ?? ''}</span></td>
<td class="Umaban${o.umaban ?? ''} Txt_C">${o.umaban ?? ''}</td>
<td class="CheckMark Horse_Select"><select><option>--</option></select></td>
<td class="HorseInfo"><span class="HorseName"><a href="https://db.netkeiba.com/horse/${o.id}" target="_blank" title="${o.name}">${o.name}</a></span></td>
<td class="Barei Txt_C">${o.barei}</td>
<td class="Txt_C">${o.kinryo}</td>
<td class="Jockey">${o.jockey ? `<a href="https://db.netkeiba.com/jockey/result/recent/${o.jockey[0]}/" title="${o.jockey[1]}">${o.jockey[1]}</a>` : ''}</td>
<td class="Trainer"><span class="Label1">美浦</span><a href="https://db.netkeiba.com/trainer/result/recent/${o.trainer[0]}/" title="${o.trainer[1]}">${o.trainer[1]}</a></td>
<td class="Weight"></td>
</tr>`;
}

describe('文字列の下ごしらえ', () => {
	it('全角の英数字を半角に寄せ、括弧は残す', () => {
		expect(toHalfWidth('スプリンターズＳ')).toBe('スプリンターズS');
		expect(toHalfWidth('Ｃ．ルメール')).toBe('C.ルメール');
		expect(toHalfWidth('天皇賞（秋）')).toBe('天皇賞（秋）');
	});

	it('性齢を分ける。騸はセに寄せる', () => {
		expect(parseSexAge('牡5')).toEqual({ sex: '牡', age: 5 });
		expect(parseSexAge(' 騸7 ')).toEqual({ sex: 'セ', age: 7 });
		expect(parseSexAge('')).toEqual({});
	});

	it('馬体重と増減を分ける。計不なら何も返さない', () => {
		expect(parseHorseWeight('472<small>(-10)</small>')).toEqual({
			horseWeight: 472,
			horseWeightDiff: -10
		});
		expect(parseHorseWeight('504(+4)')).toEqual({ horseWeight: 504, horseWeightDiff: 4 });
		expect(parseHorseWeight('計不')).toEqual({});
	});

	it('馬場の1文字表記を受ける', () => {
		expect(parseTrackCondition('稍')).toBe('稍重');
		expect(parseTrackCondition('不')).toBe('不良');
		expect(parseTrackCondition('重')).toBe('重');
		expect(parseTrackCondition('')).toBeUndefined();
	});

	it('回りは場で決め、新潟の芝1000は直線、障害は決めない', () => {
		expect(directionOf('中京', '芝', 1200)).toBe('左');
		expect(directionOf('中山', 'ダート', 1800)).toBe('右');
		expect(directionOf('新潟', '芝', 1000)).toBe('直線');
		expect(directionOf('東京', '障害', 3000)).toBeUndefined();
	});
});

describe('splitRaceName', () => {
	it('格を外して G1〜G3 に直す', () => {
		expect(splitRaceName('産経賞オールカマー(GII)')).toEqual({
			name: '産経賞オールカマー',
			grade: 'G2'
		});
		expect(splitRaceName('スプリンターズＳ(G1)')).toMatchObject({
			name: 'スプリンターズS',
			grade: 'G1'
		});
		expect(splitRaceName('UHB賞(OP)')).toMatchObject({ name: 'UHB賞', grade: 'OP' });
	});

	it('条件戦はクラスを className に分ける', () => {
		expect(splitRaceName('木更津特別(2勝)')).toEqual({
			name: '木更津特別',
			className: '2勝クラス'
		});
		expect(splitRaceName('3歳以上1勝クラス')).toMatchObject({
			name: '3歳以上1勝クラス',
			className: '1勝クラス'
		});
		expect(splitRaceName('2歳新馬')).toMatchObject({ className: '新馬' });
	});

	it('ステークスは S に縮める', () => {
		expect(splitRaceName('ローズステークス(GII)').name).toBe('ローズS');
	});
});

describe('parseRaceList', () => {
	it('race_id から場とレース番号を読む', () => {
		const html = `
<li class="RaceList_DataItem"><a href="../race/shutuba.html?race_id=202606040911&rf=race_list"><span class="ItemTitle">スプリンター</span></a></li>
<li class="RaceList_DataItem"><a href="../race/shutuba.html?race_id=202609040901&rf=race_list"><span class="ItemTitle">2歳未勝利</span></a></li>`;
		expect(parseRaceList(html)).toEqual([
			{ raceId: '202606040911', course: '中山', raceNumber: 11, title: 'スプリンター' },
			{ raceId: '202609040901', course: '阪神', raceNumber: 1, title: '2歳未勝利' }
		]);
	});
});

describe('parseShutuba', () => {
	const page = (rows: string) =>
		`<title>スプリンターズＳ(G1) 出馬表 | 2026年9月27日 中山11R レース情報(JRA) - netkeiba</title>
${raceData('15:40発走 / 芝1200m (右 外 C)', '4回 中山 9日目 サラ系３歳以上 オープン 定量 21頭')}
<table class="Shutuba_Table RaceTable01 ShutubaTable"><tbody>${rows}</tbody></table>
<table class="Shutuba_Table PredictRap_Table">${shutubaRow({ id: '9999999999', name: '別の表の馬', barei: '牡3', kinryo: '57.0', trainer: ['1', 'x'] })}</table>`;

	it('枠が決まる前は枠・馬番が空のまま登録馬を返す', () => {
		const { meta, rows } = parseShutuba(
			page(
				shutubaRow({
					id: '2022103875',
					name: 'アイサンサン',
					barei: '牝4',
					kinryo: '56.0',
					jockey: ['00732', '幸'],
					trainer: ['01218', '橋田']
				}) +
					shutubaRow({
						id: '2022106394',
						name: 'クラスペディア',
						barei: '牡4',
						kinryo: '58.0',
						trainer: ['01200', '河嶋']
					})
			)
		);
		expect(meta).toEqual({
			date: '2026-09-27',
			name: 'スプリンターズS',
			grade: 'G1',
			className: undefined,
			surface: '芝',
			distance: 1200,
			direction: '右',
			trackCondition: undefined,
			weather: undefined
		});
		expect(rows).toEqual([
			{
				bracket: undefined,
				horseNumber: undefined,
				name: 'アイサンサン',
				horseId: '2022103875',
				sex: '牝',
				age: 4,
				weight: 56,
				jockey: { id: '00732', short: '幸' },
				trainer: { id: '01218', short: '橋田' }
			},
			expect.objectContaining({ name: 'クラスペディア', jockey: undefined })
		]);
	});

	it('枠が決まったら枠・馬番を読む。出馬表の外の表は拾わない', () => {
		const { rows } = parseShutuba(
			page(
				shutubaRow({
					waku: 1,
					umaban: 1,
					id: '2021102800',
					name: 'キャントウェイト',
					barei: '牡5',
					kinryo: '57.0',
					jockey: ['00660', '横山典'],
					trainer: ['01024', '萱野']
				})
			)
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ bracket: 1, horseNumber: 1, name: 'キャントウェイト' });
	});
});

describe('parseResult', () => {
	const row = (o: {
		rank: string;
		waku: number;
		umaban: number;
		id: string;
		name: string;
		margin: string;
		weight: string;
	}) =>
		// 結果の表は `<tr  class=` と空白が2つ入る。
		`<tr  class="HorseList">
<td class="Result_Num"><div class="Rank">${o.rank}</div></td>
<td class="Num Waku${o.waku}"><div>${o.waku}</div></td>
<td class="Num Txt_C"><div>${o.umaban}</div></td>
<td class="Horse_Info"><span class="Horse_Name"><a href="https://db.netkeiba.com/horse/${o.id}" title="${o.name}">${o.name}</a></span></td>
<td class="Horse_Info Txt_C"><span> 牡5 </span></td>
<td class="Jockey_Info"><span class="JockeyWeight">57.0</span></td>
<td class="Jockey"><a href="https://db.netkeiba.com/jockey/result/recent/00660/"><span> 横山典 </span></a></td>
<td class="Time"><span class="RaceTime">${o.rank === '取消' ? '' : '2:16.9'}</span></td>
<td class="Time"><span class="RaceTime">${o.margin}</span></td>
<td class="Odds Txt_C"><span class="OddsPeople">6</span></td>
<td class="Odds Txt_R"><span>12.1</span></td>
<td class="Time BgYellow"> 36.5 </td>
<td class="PassageRate"> 6-6-7-5 </td>
<td class="Trainer"><span class="Label1">美浦</span><a href="https://db.netkeiba.com/trainer/result/recent/01024/">萱野</a></td>
<td class="Weight"> ${o.weight}</td>
</tr>`;

	it('着順から馬体重まで読み、馬場と天候も取る', () => {
		const html = `<title>オールカマー(G2) 結果・払戻 | 2026年9月20日 中山11R</title>
${raceData('15:45発走 / 芝2200m (右 外 C) / 天候:雨 / 馬場:重', '4回 中山 6日目 サラ系３歳以上 オープン')}
<table summary="全着順" class="RaceTable01" id="All_Result_Table"><tbody>
${row({ rank: '2', waku: 1, umaban: 1, id: '2021102800', name: 'キャントウェイト', margin: 'ハナ', weight: '472<small>(-10)</small>' })}
${row({ rank: '取消', waku: 3, umaban: 5, id: '2020000000', name: 'トリケシ', margin: '', weight: '' })}
</tbody></table>`;
		const { meta, rows } = parseResult(html);
		expect(meta).toMatchObject({
			date: '2026-09-20',
			name: 'オールカマー',
			grade: 'G2',
			trackCondition: '重',
			weather: '雨'
		});
		expect(rows[0]).toEqual({
			finish: 2,
			status: undefined,
			bracket: 1,
			horseNumber: 1,
			name: 'キャントウェイト',
			horseId: '2021102800',
			sex: '牡',
			age: 5,
			weight: 57,
			jockey: { id: '00660', short: '横山典' },
			time: '2:16.9',
			margin: 'ハナ',
			popularity: 6,
			odds: 12.1,
			last3f: 36.5,
			passing: '6-6-7-5',
			horseWeight: 472,
			horseWeightDiff: -10
		});
		expect(rows[1]).toMatchObject({ finish: undefined, status: '取消', time: undefined });
	});

	it('障害の上りは上がり3Fとして読まない', () => {
		const html = `<title>中山グランドジャンプ(J.G1) 結果・払戻 | 2026年4月18日 中山11R</title>
${raceData('15:40発走 / 障4250m (芝 右) / 天候:晴 / 馬場:良', '3回 中山 7日目 障害４歳以上 オープン')}
<table summary="全着順" class="RaceTable01" id="All_Result_Table"><tbody>
${row({ rank: '1', waku: 1, umaban: 1, id: '2019000001', name: 'ジャンパー', margin: '', weight: '480<small>(0)</small>' })}
</tbody></table>`;
		const { meta, rows } = parseResult(html);
		expect(meta.surface).toBe('障害');
		expect(rows[0].last3f).toBeUndefined();
	});
});

describe('parseHorseResults', () => {
	const headers = [
		'日付',
		'開催',
		'天<br />気',
		'R',
		'レース名',
		'映<br />像',
		'頭<br />数',
		'枠<br />番',
		'馬<br />番',
		'オッズ',
		'人<br />気',
		'着<br />順',
		'騎手',
		'斤<br />量',
		'距離',
		'馬<br />場',
		'タイム',
		'着差',
		'通過',
		'上り',
		'馬体重'
	];
	const tr = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
	const table = (rows: string[]) =>
		`<table class="db_h_race_results nk_tb_common"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

	it('見出しで列を引き、JRA のレースだけを新しい順に返す', () => {
		const runs = parseHorseResults(
			table([
				tr([
					'<a href="/race/list/20260920/">2026/09/20</a>',
					'4中山6',
					'雨',
					'11',
					'<a href="https://db.netkeiba.com/race/202606040611/" title="産経賞オールカマー(GII)">産経賞オールカマー(GII)</a>',
					'',
					'13',
					'1',
					'1',
					'12.1',
					'6',
					'2',
					'<a href="/jockey/result/recent/00660/">横山典弘</a>',
					'57',
					'芝2200',
					'重',
					'2:16.9',
					'0.0',
					'6-6-7-5',
					'36.5',
					'472(-10)'
				]),
				tr([
					'2026/08/01',
					'船橋',
					'晴',
					'11',
					'地方の重賞',
					'',
					'12',
					'1',
					'1',
					'3.0',
					'1',
					'1',
					'騎手',
					'57',
					'ダ1600',
					'良',
					'1:40.0',
					'0.0',
					'1-1',
					'37.0',
					'480(0)'
				]),
				tr([
					'2026/07/05',
					'2福島2',
					'曇',
					'9',
					'<a href="https://db.netkeiba.com/race/202603020209/">猪苗代特別(2勝)</a>',
					'',
					'14',
					'5',
					'8',
					'8.0',
					'4',
					'取',
					'Ｍ．デムーロ',
					'57',
					'芝1800',
					'稍',
					'',
					'',
					'',
					'',
					''
				])
			])
		);
		expect(runs).toHaveLength(2);
		expect(runs[0]).toEqual({
			date: '2026-09-20',
			course: '中山',
			raceNumber: 11,
			raceId: '202606040611',
			race: {
				name: '産経賞オールカマー',
				grade: 'G2',
				className: undefined,
				surface: '芝',
				distance: 2200,
				direction: '右',
				trackCondition: '重',
				weather: '雨'
			},
			bracket: 1,
			horseNumber: 1,
			odds: 12.1,
			popularity: 6,
			finish: 2,
			status: undefined,
			jockey: '横山典弘',
			jockeyId: '00660',
			weight: 57,
			time: '2:16.9',
			passing: '6-6-7-5',
			last3f: 36.5,
			horseWeight: 472,
			horseWeightDiff: -10
		});
		expect(runs[1]).toMatchObject({
			course: '福島',
			race: { name: '猪苗代特別', className: '2勝クラス', trackCondition: '稍重' },
			finish: undefined,
			status: '取',
			jockey: 'M.デムーロ'
		});
	});

	it('障害の上りは上がり3Fとして読まない', () => {
		const runs = parseHorseResults(
			table([
				tr([
					'2026/04/18',
					'3中山7',
					'晴',
					'11',
					'<a href="https://db.netkeiba.com/race/202606030711/">中山グランドジャンプ(J.GI)</a>',
					'',
					'12',
					'1',
					'1',
					'2.0',
					'1',
					'1',
					'騎手',
					'63',
					'障4250',
					'良',
					'4:45.0',
					'0.0',
					'1-1-1-1',
					'13.3',
					'480(0)'
				])
			])
		);
		expect(runs[0]).toMatchObject({ race: { grade: 'G1', surface: '障害' }, finish: 1 });
		expect(runs[0].last3f).toBeUndefined();
	});
});

describe('馬の基本情報', () => {
	it('性・生年・調教師を読む', () => {
		const html = `<div class="horse_title"><h1>キャントウェイト</h1><p class="eng_name">Can't Wait</p><p class="txt_01">現役 牡5歳 芦毛 </p></div>
<table class="db_prof_table"><tr><th>生年月日</th><td>2021年4月4日</td></tr><tr><th>調教師</th><td><a href="/trainer/01024/">萱野浩二</a> (美浦)</td></tr></table>`;
		expect(parseHorseProfile(html)).toEqual({
			name: 'キャントウェイト',
			sex: '牡',
			birthYear: 2021,
			trainer: '萱野浩二'
		});
	});

	it('血統表の1代目から父と母を読む', () => {
		const html = `<table class="blood_table">
<tr><td rowspan="2" class="b_ml"><a><span>ゴールドシップ</span></a></td><td class="b_ml"><a><span>ステイゴールド</span></a></td></tr>
<tr><td class="b_fml"><a><span>ポイントフラッグ</span></a></td></tr>
<tr><td rowspan="2" class="b_fml"><a><span>マイネランデブー</span></a></td><td class="b_ml"><a><span>アグネスデジタル</span></a></td></tr>
</table>`;
		expect(parsePedigree(html)).toEqual({ sire: 'ゴールドシップ', dam: 'マイネランデブー' });
	});

	it('騎手・調教師のページの title から名前を読む', () => {
		expect(parsePersonName('<title>幸英明のプロフィール | 騎手データ - netkeiba</title>')).toBe(
			'幸英明'
		);
		expect(parsePersonName('<title>Ｃ．ルメールのプロフィール | 騎手データ</title>')).toBe(
			'C.ルメール'
		);
	});
});

describe('setRequestInterval', () => {
	it('0.5秒より短い間隔は受け付けない', () => {
		expect(() => setRequestInterval(499)).toThrow(RangeError);
		expect(() => setRequestInterval(Number.NaN)).toThrow(RangeError);
	});

	it('0.5秒以上なら受け付ける', () => {
		expect(() => setRequestInterval(500)).not.toThrow();
		setRequestInterval(1000);
	});
});
