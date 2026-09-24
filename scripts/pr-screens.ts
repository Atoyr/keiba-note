/**
 * `pnpm run screens` で撮ったキャプチャを、PR 本文に貼る Markdown にする（docs/testing.md）。
 *
 *   pnpm run screens:pr <機能名>
 *
 * キャプチャは作業ブランチにコミットしない（docs/screenshots/ は .gitignore）。
 * 代わりに、画像置き場の `screenshots` ブランチへ1コミットで上げ、そのコミット SHA で URL を組む。
 * `screenshots` は main に合流させない、画像だけの枝。作業ツリーと今のブランチには触らない。
 *
 * ブランチ名でなく SHA で組むのは、同じ機能名で上げ直しても前の PR の画像が差し替わらないようにするため。
 * 各コミットの木はその回の画像だけを持ち、前のコミットを親にする（履歴から辿れるので画像は消えない）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BRANCH = 'screenshots';

const feature = process.argv[2];
if (!feature || !/^[a-z0-9][a-z0-9-]*$/.test(feature)) {
	console.error('usage: pnpm run screens:pr <機能名>');
	process.exit(2);
}

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const dir = `docs/screenshots/${feature}`;
const afterDir = join(dir, 'after');
if (!existsSync(afterDir)) fail(`${afterDir} がありません。先に pnpm run screens ${feature} after`);

// git@github.com:Owner/repo.git / https://github.com/Owner/repo(.git) のどちらでも。
const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const repo =
	remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1] ??
	fail(`GitHub の remote ではありません: ${remote}`);

const files = readdirSync(afterDir)
	.filter((f) => f.endsWith('.png'))
	.sort();
if (files.length === 0) fail(`${afterDir} に画像がありません。`);
const uploads = files.flatMap((f) =>
	['before', 'after'].map((label) => `${label}/${f}`).filter((p) => existsSync(join(dir, p)))
);

// 今のブランチの index を汚さないよう、一時の index で木を組む。
const tmp = mkdtempSync(join(tmpdir(), 'screens-pr-'));
const env = { ...process.env, GIT_INDEX_FILE: join(tmp, 'index') };
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', env }).trim();

const head = git('rev-parse', '--short', 'HEAD');
let sha = '';
try {
	for (const f of uploads) {
		const blob = git('hash-object', '-w', join(dir, f));
		git('update-index', '--add', '--cacheinfo', `100644,${blob},${feature}/${f}`);
	}
	const tree = git('write-tree');

	// ほかの作業ツリーが同時に上げると push が弾かれるので、最新の先端を親に組み直して数回試す。
	for (let attempt = 1; ; attempt++) {
		const tip = git('ls-remote', 'origin', `refs/heads/${BRANCH}`).split(/\s/)[0];
		if (tip) git('fetch', '--no-tags', '--quiet', 'origin', tip);
		const commit = git(
			'commit-tree',
			tree,
			...(tip ? ['-p', tip] : []),
			'-m',
			`screens: ${feature}（${head} で撮影）`
		);
		try {
			execFileSync('git', ['push', '--quiet', 'origin', `${commit}:refs/heads/${BRANCH}`], {
				stdio: ['ignore', 'ignore', 'pipe']
			});
			sha = commit;
			break;
		} catch (e) {
			if (attempt >= 3) {
				const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? '';
				fail(`${BRANCH} ブランチへの push に失敗しました。\n${stderr}`);
			}
		}
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

const url = (path: string) => `https://raw.githubusercontent.com/${repo}/${sha}/${feature}/${path}`;
const rows = files.map((f) => {
	const [screen, viewport] = f.split('.');
	const beforeCell = uploads.includes(`before/${f}`)
		? `![before](${url(`before/${f}`)})`
		: '（新しい画面）';
	return `| \`${screen}\` ${viewport} | ${beforeCell} | ![after](${url(`after/${f}`)}) |`;
});

console.log(
	[
		`撮影: \`pnpm run screens ${feature}\`（本番ビルド + e2e/seed.sql、desktop 1280px / mobile 390px）`,
		'',
		'| 画面 | before | after |',
		'| --- | --- | --- |',
		...rows
	].join('\n')
);
