import { describe, expect, it } from 'vitest';
import { COURSES } from '$lib/schemas/race';
import { COURSE_SPECS, courseMap } from './course';

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
		expect(courseMap(race('新潟', '芝', 2200))?.file).toBe('niigata-turf-inner');
	});

	it('JRA が内回り・外回りの両方に載せている距離は、両方を出す', () => {
		// 京都の2000m、中山の3200m（外回りから内回りへ回る）、表に無い距離。
		for (const [course, distance] of [
			['京都', 2000],
			['中山', 3200],
			['阪神', 1400],
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
