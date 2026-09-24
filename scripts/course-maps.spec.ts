import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allCourseMaps } from '../src/lib/utils/course.ts';
import { COURSE_MAP_DIR } from './course-maps.ts';

describe('コース図', () => {
	it('コミットされた SVG が src/lib/utils/course.ts から書き出したものと同じ（違えば pnpm run course-maps）', async () => {
		const expected = allCourseMaps();
		const names = (await readdir(COURSE_MAP_DIR)).filter((f) => f.endsWith('.svg')).sort();
		expect(names).toEqual([...expected.keys()].sort());
		for (const [name, svg] of expected) {
			expect(await readFile(join(COURSE_MAP_DIR, name), 'utf8'), name).toBe(svg);
		}
	});
});
