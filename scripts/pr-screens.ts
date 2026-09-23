/**
 * `pnpm run screens` で撮ったキャプチャを、PR 本文に貼る Markdown にする（docs/testing.md）。
 *
 *   pnpm run screens:pr <機能名>
 *
 * 画像の URL はブランチ名ではなくコミット SHA で組む。ブランチ名だと、あとの push で
 * PR に貼った画像まで差し替わり、ブランチを消すと画像ごと消えるため。
 * そのため、キャプチャがコミット済みで push 済みであることを先に確かめる。
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const feature = process.argv[2];
if (!feature || !/^[a-z0-9][a-z0-9-]*$/.test(feature)) {
	console.error('usage: pnpm run screens:pr <機能名>');
	process.exit(2);
}

const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const dir = `docs/screenshots/${feature}`;
const afterDir = join(dir, 'after');
if (!existsSync(afterDir)) fail(`${afterDir} がありません。先に pnpm run screens ${feature} after`);

if (git(`status --porcelain -- ${dir}`) !== '') {
	fail(`${dir} にコミットしていない変更があります。コミットして push してから実行してください。`);
}
const sha = git('rev-parse HEAD');
if (git(`branch -r --contains ${sha}`) === '') {
	fail(`${sha.slice(0, 7)} がまだ push されていません。push してから実行してください。`);
}

// git@github.com:Owner/repo.git / https://github.com/Owner/repo(.git) のどちらでも。
const remote = git('remote get-url origin');
const repo =
	remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1] ??
	fail(`GitHub の remote ではありません: ${remote}`);
const url = (path: string) => `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;

const files = readdirSync(afterDir)
	.filter((f) => f.endsWith('.png'))
	.sort();
const rows = files.map((f) => {
	const [screen, viewport] = f.split('.');
	const before = `${dir}/before/${f}`;
	const beforeCell = existsSync(before) ? `![before](${url(before)})` : '（新しい画面）';
	return `| \`${screen}\` ${viewport} | ${beforeCell} | ![after](${url(`${dir}/after/${f}`)}) |`;
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
