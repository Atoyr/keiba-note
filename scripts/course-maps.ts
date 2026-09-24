/**
 * コース図（`src/lib/assets/courses/*.svg`）を書き出す。
 *
 *   pnpm run course-maps
 *
 * 図の正は `src/lib/utils/course.ts`（寸法と描き方）。SVG は生成物なので手で直さない。
 * 直したら書き出し直して、生成物も一緒にコミットする（`course-maps.spec.ts` が食い違いを落とす）。
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { allCourseMaps } from '../src/lib/utils/course.ts';

export const COURSE_MAP_DIR = 'src/lib/assets/courses';

async function main() {
	await mkdir(COURSE_MAP_DIR, { recursive: true });
	const files = allCourseMaps();
	// 場や図の種類を減らしたときに、古い図が残らないように。
	for (const name of await readdir(COURSE_MAP_DIR)) {
		if (name.endsWith('.svg') && !files.has(name)) await rm(join(COURSE_MAP_DIR, name));
	}
	for (const [name, svg] of files) await writeFile(join(COURSE_MAP_DIR, name), svg);
	console.log(`${files.size} 枚を ${COURSE_MAP_DIR} に書き出しました`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
