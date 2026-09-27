import { describe, expect, it } from 'vitest';
import { COURSE_SPECS, courseMap } from './course';
import { elevationChart } from './course-elevation';
import { ELEVATIONS } from './course-elevation-data';

const race = (course: string, surface: string, distance: number | null, direction = null) => ({
	course,
	surface,
	distance,
	direction
});

describe('高低断面の数値', () => {
	it('どの図もゴールを 0m として、一周距離（直線コースは発走地点）まで並ぶ', () => {
		for (const spec of Object.values(COURSE_SPECS)) {
			const laps: [string, number][] = [[`${spec.slug}-dirt`, spec.dirt.lap]];
			if (spec.straightCourse) laps.push([`${spec.slug}-straight`, spec.straightCourse]);
			for (const loop of spec.turf) {
				const variant = loop.name === '内回り' ? 'turf-inner' : loop.name ? 'turf-outer' : 'turf';
				laps.push([`${spec.slug}-${variant}`, loop.lap]);
			}
			for (const [file, lap] of laps) {
				const points = ELEVATIONS[file];
				expect(points, file).toBeDefined();
				expect(points[0], file).toEqual([0, 0]);
				// 距離は丸めてある。
				expect(Math.abs(points[points.length - 1][0] - lap), file).toBeLessThan(1);
				const ds = points.map(([d]) => d);
				expect(ds, file).toEqual([...ds].sort((a, b) => a - b));
			}
		}
	});

	it('読み取った高低差は、JRA の公表値と 0.3m 以内で合う', () => {
		for (const spec of Object.values(COURSE_SPECS)) {
			const loops = [...spec.turf.map((l) => [l, l.name] as const), [spec.dirt, 'dirt'] as const];
			for (const [loop, name] of loops) {
				const variant =
					name === 'dirt'
						? 'dirt'
						: name === '内回り'
							? 'turf-inner'
							: name === '外回り'
								? 'turf-outer'
								: 'turf';
				const es = ELEVATIONS[`${spec.slug}-${variant}`].map(([, e]) => e);
				const rise = Math.max(...es) - Math.min(...es);
				expect(Math.abs(rise - loop.rise), `${spec.slug}-${variant}`).toBeLessThanOrEqual(0.31);
			}
		}
	});
});

describe('レースの高低断面', () => {
	it('中山の芝1200m（スプリンターズS）は外回りを、ゴールからスタートまで拾う', () => {
		const p = courseMap(race('中山', '芝', 1200))!.profile!;
		expect(p.distance).toBe(1200);
		expect(p.points[0]).toEqual([0, 0]);
		const [lastS, lastE] = p.points[p.points.length - 1];
		expect(lastS).toBe(1200);
		// スタートは向正面の上りきったあたり。ゴールより 1.5m ほど高い。
		expect(lastE).toBeCloseTo(1.5, 1);
		// ゴール前の急坂の下（残り 200m ほど）がいちばん低い。
		const low = p.points.reduce((a, b) => (b[1] < a[1] ? b : a));
		expect(low[0]).toBeGreaterThan(150);
		expect(low[0]).toBeLessThan(300);
		expect(p.straight).toBe(310);
		// 右回りはゴールが左（スタンドから見て右から左へ走ってくる）。
		expect(p.goalRight).toBe(false);
		expect(p.surface).toBe('芝');
	});

	it('一周より長いレースは2周目に入る', () => {
		const p = courseMap(race('東京', '芝', 2400))!.profile!;
		const ds = p.points.map(([s]) => s);
		expect(ds[ds.length - 1]).toBe(2400);
		// 一周（2083m）のゴール地点を1度だけ通る。
		expect(ds.filter((s) => s === 2083)).toHaveLength(1);
		expect(ds).toEqual([...ds].sort((a, b) => a - b));
		expect(p.goalRight).toBe(true);
	});

	it('ダートと直線コースも出す。直線コースは全部が直線で、ゴールが右', () => {
		const dirt = courseMap(race('中山', 'ダート', 1800))!.profile!;
		expect(dirt.surface).toBe('ダート');
		expect(dirt.straight).toBe(308);

		const straight = courseMap(race('新潟', '芝', 1000))!.profile!;
		expect(straight.straight).toBeNull();
		expect(straight.goalRight).toBe(true);
		expect(straight.points[straight.points.length - 1]).toEqual([1000, 0.2]);
	});

	it('内回り・外回りが決まらない・障害・距離が無いレースには出さない', () => {
		expect(courseMap(race('京都', '芝', 1600))!.profile).toBeNull();
		expect(courseMap(race('中山', '芝', 3200))!.profile).toBeNull();
		expect(courseMap(race('中山', '障害', 4100))!.profile).toBeNull();
		expect(courseMap(race('東京', '芝', null))!.profile).toBeNull();
	});
});

describe('elevationChart', () => {
	it('右回りはゴールを左に、スタートを右に置き、目盛りはゴールからの距離', () => {
		const chart = elevationChart(courseMap(race('中山', '芝', 1200))!.profile!);
		expect(chart.ticks.map((t) => t.label)).toEqual([
			'ゴール',
			'200m',
			'400m',
			'600m',
			'800m',
			'スタート'
		]);
		expect(chart.ticks[0].x).toBe(0);
		expect(chart.ticks[chart.ticks.length - 1].x).toBe(100);
		// 最後の直線はゴール側（左）に。
		expect(chart.straight?.x1).toBe(0);
		expect(chart.straight?.x2).toBeCloseTo((310 / 1200) * 100);
		expect(chart.summary).toBe(
			'高低断面図（ゴールを 0m として）。スタート +1.5m、' +
				'いちばん高い所 +1.5m（ゴールまで 1200m）、いちばん低い所 -2.5m（ゴールまで 250m）'
		);
	});

	it('左回りはゴールを右に置く。長いレースは目盛りを粗くする', () => {
		const chart = elevationChart(courseMap(race('東京', '芝', 2400))!.profile!);
		expect(chart.ticks[0]).toEqual({ x: 100, label: 'ゴール' });
		expect(chart.ticks[chart.ticks.length - 1]).toEqual({ x: 0, label: 'スタート' });
		// 400m ごと。スタートのすぐ隣（2000m）は文字が重なるので出さない。
		expect(chart.ticks.map((t) => t.label)).toEqual([
			'ゴール',
			'400m',
			'800m',
			'1200m',
			'1600m',
			'スタート'
		]);
		expect(chart.straight?.x2).toBe(100);
	});

	it('高さの目盛りは全場で同じ（札幌の平らなコースを山に見せない）', () => {
		const sapporo = elevationChart(courseMap(race('札幌', '芝', 1800))!.profile!);
		const nakayama = elevationChart(courseMap(race('中山', '芝', 1200))!.profile!);
		expect(sapporo.levels).toEqual(nakayama.levels);
		expect(sapporo.levels.map((l) => l.label)).toEqual(['+4m', '+2m', '0m', '-2m']);
	});
});
