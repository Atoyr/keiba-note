// `#lib/…` の import は実ファイルの拡張子まで書く約束（architecture.md 第2章）を機械で見る。
// ESLint は src/lib/components/ui/（shadcn-svelte の生成物）を見ないので、ここで src/ を総なめにする。
// CLI は `#lib/utils.js`（実体は utils.ts）と書くので、入れた直後に直し忘れるとここで落ちる（design-system.md）。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const DIRS = ['src', 'scripts', 'e2e'];
const SOURCE = /\.(ts|js|svelte)$/;
// 引用符で囲まれた `#lib/…`。`import.meta.glob` の `*` を含むものはファイルを指さないので外す。
const SPECIFIER = /['"](#lib\/[^'"*]+)['"]/g;

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
		return SOURCE.test(e.name) ? [p] : [];
	});
}

describe('#lib の import', () => {
	it('どれも src/lib の実ファイルを拡張子まで指す（`.js` → `.ts`・拡張子なし・ディレクトリは落ちる）', () => {
		const bad: string[] = [];
		for (const file of DIRS.flatMap((d) => walk(path.join(root, d)))) {
			for (const [, spec] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
				const target = path.join(root, 'src/lib', spec.slice('#lib/'.length));
				if (!existsSync(target) || !statSync(target).isFile()) {
					bad.push(`${path.relative(root, file)}: ${spec}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
