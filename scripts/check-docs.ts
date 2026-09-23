/**
 * 文書の目次とリンクが壊れていないかを確かめる（docs/harness.md 第7章）。
 *
 *   pnpm run docs:check     （pnpm run lint の中でも回る）
 *
 * AGENTS.md は知識の目次で、詳細は分野ごとの文書に置く。この形は放っておくと崩れる
 * （文書を足しても目次に載らない、改名したのにコメントが古い名前を指したまま、など）。
 * 崩れたことに人が気づくのは遅いので、ここで機械的に止める。
 *
 * 見出しへのリンク（`#...`）の先までは見ない。日本語の見出しの anchor の作り方が
 * GitHub 次第で、確かめる手間に見合わない。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, normalize } from 'node:path';

/** AGENTS.md の行数の上限。毎回読むものは短くないと読み落とされる。 */
const AGENTS_MAX_LINES = 120;

/** 改名した文書。古い名前は docs/ の経緯の文にだけ残してよい。 */
const RENAMED: Record<string, string> = { 'design.md': 'product.md' };

/**
 * 名前を出すが、リポジトリに無くて正しい文書。
 * TASKS.md はエージェントが長い作業の進み具合を書くメモで、コミットしない（.gitignore）。
 */
const NOT_COMMITTED = new Set(['TASKS.md']);

/** 手で直さない生成物と、画像。 */
const IGNORED = /^(drizzle|docs\/screenshots|node_modules)\//;
const TEXT = /\.(md|ts|js|svelte|sql|txt|toml|ya?ml|example)$/;

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
	.split('\n')
	.map((f) => f.trim())
	.filter((f) => f && !IGNORED.test(f) && existsSync(f));

const markdown = files.filter((f) => f.endsWith('.md'));
const docNames = new Set(markdown.map((f) => basename(f)));
const problems: string[] = [];
const report = (file: string, line: number, message: string) =>
	problems.push(`${file}:${line}  ${message}`);

/** Markdown の相対リンクの行き先（コードブロックの中は除く）。 */
function relativeLinks(file: string): { line: number; target: string }[] {
	const links: { line: number; target: string }[] = [];
	let fenced = false;
	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((text, i) => {
			if (/^\s*```/.test(text)) fenced = !fenced;
			if (fenced) return;
			for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
				const raw = m[1];
				if (/^([a-z]+:|#)/i.test(raw)) continue;
				links.push({ line: i + 1, target: normalize(join(dirname(file), raw.split('#')[0])) });
			}
		});
	return links;
}

// 1. 文書の中の相対リンクの先が在る
for (const file of markdown) {
	for (const { line, target } of relativeLinks(file)) {
		if (!existsSync(target)) report(file, line, `リンク先がありません: ${target}`);
	}
}

// 2. docs/*.md がすべて AGENTS.md の目次から張られている
const fromAgents = new Set(relativeLinks('AGENTS.md').map((l) => l.target.replaceAll('\\', '/')));
for (const doc of markdown.filter((f) => /^docs\/[^/]+\.md$/.test(f))) {
	if (!fromAgents.has(doc)) report(doc, 1, 'AGENTS.md の目次に載っていません');
}

// 3. AGENTS.md が目次の長さに収まっている
const agentsLines = readFileSync('AGENTS.md', 'utf8').trimEnd().split('\n').length;
if (agentsLines > AGENTS_MAX_LINES) {
	report(
		'AGENTS.md',
		agentsLines,
		`${agentsLines} 行あります（上限 ${AGENTS_MAX_LINES}）。詳細は分野の文書に移してください`
	);
}

// 4. コード・文書に出てくる「〇〇.md」が在る（改名の取り残しを拾う）
// このファイル自身は改名表に古い名前を持つので除く。
for (const file of files.filter((f) => TEXT.test(f) && f !== 'scripts/check-docs.ts')) {
	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((text, i) => {
			for (const m of text.matchAll(/(?<![\w.-])([\w-]+\.md)\b/g)) {
				const name = m[1];
				if (docNames.has(name) || NOT_COMMITTED.has(name)) continue;
				if (RENAMED[name]) {
					if (file.startsWith('docs/')) continue;
					report(file, i + 1, `${name} は ${RENAMED[name]} に改名済みです`);
				} else {
					report(file, i + 1, `${name} という文書はありません`);
				}
			}
		});
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	console.error(`\n文書の検査で ${problems.length} 件の問題があります（docs/harness.md 第7章）。`);
	process.exit(1);
}
console.log(`文書の検査: ${markdown.length} 件の Markdown を確かめました。問題はありません。`);
