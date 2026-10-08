import { describe, expect, it } from 'vitest';
import { COURSES } from '$lib/schemas/race';
import { COURSE_SPECS, courseMap, courseMapSvg, type CourseMapSource } from './course';

const race = (course: string, surface: string | null, distance: number | null = null) => ({
	course,
	surface,
	distance,
	direction: null
});

describe('courseMap', () => {
	it('登録できる競馬場はすべて図を持つ', () => {
		expect(Object.keys(COURSE_SPECS).sort()).toEqual([...COURSES].sort());
	});

	it('芝は芝の図と、回り・直線・高低差を出す', () => {
		const map = courseMap(race('東京', '芝', 2400));
		expect(map?.file).toBe('tokyo-turf');
		expect(map?.alt).toBe('東京競馬場のコース図（芝）');
		expect(map?.facts).toEqual(['左回り', '直線 525.9m', '高低差 2.7m']);
	});

	it('ダートはダートの図と、ダートの寸法を出す', () => {
		const map = courseMap(race('中山', 'ダート', 1800));
		expect(map?.file).toBe('nakayama-dirt');
		expect(map?.facts).toEqual(['右回り', '直線 308m', '高低差 4.5m']);
	});

	it('内回りと外回りで違う値は両方、同じ値は1つだけ出す', () => {
		expect(courseMap(race('京都', '芝'))?.facts).toEqual([
			'右回り',
			'直線 内回り 328.4m / 外回り 403.7m',
			'高低差 内回り 3.1m / 外回り 4.3m'
		]);
		expect(courseMap(race('中山', '芝'))?.facts).toEqual(['右回り', '直線 310m', '高低差 5.3m']);
	});

	it('距離で内回りか外回りかが決まれば、そのコースだけの図と寸法を出す', () => {
		const outer = courseMap(race('京都', '芝', 2200));
		expect(outer?.file).toBe('kyoto-turf-outer');
		expect(outer?.alt).toBe('京都競馬場のコース図（芝・外回り）');
		expect(outer?.facts).toEqual(['右回り・外回り', '直線 403.7m', '高低差 4.3m']);

		const inner = courseMap(race('阪神', '芝', 2000));
		expect(inner?.file).toBe('hanshin-turf-inner');
		expect(inner?.facts).toEqual(['右回り・内回り', '直線 356.5m', '高低差 1.9m']);

		expect(courseMap(race('中山', '芝', 1600))?.file).toBe('nakayama-turf-outer');
		// JRA の表では両方にあるが、実際はほぼ内回りなので内回りに寄せている。
		expect(courseMap(race('京都', '芝', 2000))?.file).toBe('kyoto-turf-inner');
		expect(courseMap(race('阪神', '芝', 1400))?.file).toBe('hanshin-turf-inner');
		expect(courseMap(race('新潟', '芝', 2200))?.file).toBe('niigata-turf-inner');
	});

	it('JRA が内回り・外回りの両方に載せている距離は、両方を出す', () => {
		// 京都の1600m、中山の3200m（外回りから内回りへ回る）、表に無い距離。
		for (const [course, distance] of [
			['京都', 1600],
			['中山', 3200],
			['新潟', 2000],
			['京都', 2100]
		] as const) {
			expect(courseMap(race(course, '芝', distance))?.file, `${course}${distance}`).toMatch(
				/-turf$/
			);
		}
		// ダートと障害は内回り・外回りを見ない。
		expect(courseMap(race('京都', 'ダート', 1800))?.file).toBe('kyoto-dirt');
		expect(courseMap(race('阪神', '障害', 3000))?.file).toBe('hanshin-turf');
	});

	it('新潟の芝1000mと「直線」は直線コースの図', () => {
		expect(courseMap(race('新潟', '芝', 1000))?.file).toBe('niigata-straight');
		expect(
			courseMap({ course: '新潟', surface: '芝', distance: null, direction: '直線' })?.facts
		).toEqual(['直線コース 1,000m']);
		// ダートの1000mは周回コース。
		expect(courseMap(race('新潟', 'ダート', 1000))?.file).toBe('niigata-dirt');
		expect(courseMap(race('新潟', '芝', 1600))?.file).toBe('niigata-turf-outer');
	});

	it('障害は芝の図を出し、平地の寸法は出さない', () => {
		const map = courseMap(race('中山', '障害', 4100));
		expect(map?.file).toBe('nakayama-turf');
		expect(map?.facts).toEqual(['右回り']);
	});

	it('馬場が決まっていない・JRA の10場でないなら出さない', () => {
		expect(courseMap(race('東京', null))).toBeNull();
		expect(courseMap(race('大井', 'ダート', 2000))).toBeNull();
	});
});

describe('courseMapSvg', () => {
	it('中山の外回りは、内回りと直線・1コーナーを共にし、2コーナーから外へ分かれて大きく回る', () => {
		const svg = courseMapSvg(COURSE_SPECS['中山'], 'turf-outer');
		// 芝の帯（幅 28）は2本。強く描く（緑の）ほうが外回り、薄い灰色が内回り。
		const bands = [
			...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="(#\w+)" stroke-width="28"/g)
		];
		const outer = bands.find((m) => m[2] === '#3d7a45')![1];
		const inner = bands.find((m) => m[2] === '#dcdcdc')![1];
		// 直線（M… L…）から1コーナーの入口までは同じ道。
		const head = (d: string) => d.slice(0, d.indexOf('A'));
		expect(head(outer)).toBe(head(inner));
		// 外回りは 1コーナー・2コーナー・3〜4コーナーの3つの弧と、斜めの向正面。
		expect(outer.match(/A/g)).toHaveLength(3);
		expect(inner.match(/A/g)).toHaveLength(2);
	});
});

describe('道すじ（route）', () => {
	const route = (course: string, surface: string, distance: number | null, direction = null) =>
		courseMap({ course, surface, distance, direction } as CourseMapSource)?.route ?? null;
	const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
		Math.hypot(a.x - b.x, a.y - b.y);

	/** 東京の芝の図で、芝の帯に足された引き込み線（2つめのサブパス）の両端。 */
	function tokyoChute() {
		const svg = courseMapSvg(COURSE_SPECS['東京'], 'turf');
		const band = svg.match(/<path d="([^"]+)" fill="none" stroke="#3d7a45" stroke-width="28"/)![1];
		expect(band.match(/M/g)).toHaveLength(2);
		const [fx, fy, tx, ty] = band
			.slice(band.lastIndexOf('M'))
			.match(/-?\d+(?:\.\d+)?/g)!
			.map(Number);
		return { from: { x: fx, y: fy }, to: { x: tx, y: ty } };
	}

	it('線の長さはレースの距離と合う', () => {
		for (const [course, surface, distance] of [
			['東京', '芝', 1600], // 引き込み線から
			['東京', '芝', 1400],
			['東京', '芝', 2400],
			['東京', '芝', 3400], // 2周目に入る
			['中山', '芝', 1200], // 外回りのふくらみ
			['中山', '芝', 2000], // 内回り
			['京都', '芝', 2200],
			['阪神', '芝', 2000],
			['新潟', '芝', 1000], // 直線
			['東京', 'ダート', 1600],
			['札幌', '芝', 1200]
		] as const) {
			const r = route(course, surface, distance);
			expect(r, `${course}${surface}${distance}`).not.toBeNull();
			expect(Math.abs(r!.length - distance), `${course}${surface}${distance}`).toBeLessThan(0.5);
		}
	});

	it('出せないときは null（障害・距離なし・内外が決まらない芝・直線を超える距離）', () => {
		expect(route('中山', '障害', 4100)).toBeNull();
		expect(route('東京', '芝', null)).toBeNull();
		expect(route('東京', '芝', 0)).toBeNull();
		expect(route('京都', '芝', 1600)).toBeNull();
		// 直線コースは 1000m まで。「直線」と書かれたレースが 1200m と入っていても線は引けない。
		expect(route('新潟', '芝', 1200, '直線' as never)).toBeNull();
		// 馬場が決まらない・JRA の10場でないレースは、図ごと出ない。
		expect(courseMap(race('大井', 'ダート', 1600))).toBeNull();
	});

	it('右回りは左右を反転して重ねる。viewBox は図の SVG ファイルと同じ', () => {
		const r = route('中山', '芝', 1200)!;
		expect(r.flip).toBe(true);
		expect(route('東京', '芝', 1600)!.flip).toBe(false);
		expect(courseMapSvg(COURSE_SPECS['中山'], 'turf-outer')).toContain(`viewBox="${r.viewBox}"`);
	});

	it('東京芝1600m は向正面の引き込み線から出て、1400m は向正面から出る', () => {
		const { from, to } = tokyoChute();
		const s1600 = route('東京', '芝', 1600)!.start;
		const s1400 = route('東京', '芝', 1400)!.start;
		// 1600m のスタートは、2コーナーの出口から引き込み線に 180m 入った点（線の上）。
		expect(Math.abs(dist(s1600, from) - 180)).toBeLessThan(0.3);
		const cross =
			Math.abs((to.x - from.x) * (from.y - s1600.y) - (from.x - s1600.x) * (to.y - from.y)) /
			dist(from, to);
		expect(cross).toBeLessThan(0.3);
		// 引き込み線は 1600m のスタートより先まで（20m 余らせて）延びる。
		expect(Math.abs(dist(s1600, to) - 20)).toBeLessThan(0.3);
		// 1400m のスタートは、出口から 20m 進んだ向正面の上で、引き込み線の外。
		expect(Math.abs(dist(s1400, from) - 20)).toBeLessThan(0.3);
		expect(dist(s1400, to)).toBeGreaterThan(dist(from, to));
	});

	it('東京芝の2コーナーの出口はゴールから 1420m、一周は 2083.1m', () => {
		// 1420m の線は引き込み線に入らず、2コーナーの出口から始まる。
		const exit = route('東京', '芝', 1420)!.start;
		expect(dist(exit, tokyoChute().from)).toBeLessThan(0.3);
		// 距離が一周ちょうどなら、ゴールから出てゴールへ戻る（ゴール手前 0.5m の点とほぼ同じ）。
		const lap = route('東京', '芝', 2083.1)!.start;
		expect(dist(lap, route('東京', '芝', 0.5)!.start)).toBeLessThan(1.5);
	});

	it('引き込み線は、ダートの図では薄い灰色。ほかの場の芝の帯には無い', () => {
		const dirt = courseMapSvg(COURSE_SPECS['東京'], 'dirt');
		expect(dirt).not.toContain('#3d7a45');
		const gray = [
			...dirt.matchAll(/<path d="([^"]+)" fill="none" stroke="#dcdcdc" stroke-width="28"/g)
		];
		expect(gray).toHaveLength(1);
		expect(gray[0][1].match(/M/g)).toHaveLength(2);

		const nakayama = courseMapSvg(COURSE_SPECS['中山'], 'turf-outer');
		for (const m of nakayama.matchAll(
			/<path d="([^"]+)" fill="none" stroke="#\w+" stroke-width="28"/g
		)) {
			expect(m[1].match(/M/g)).toHaveLength(1);
		}
	});
});
