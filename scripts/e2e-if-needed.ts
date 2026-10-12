import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * `pnpm run verify` の最後の段。文書だけの変更なら E2E を飛ばし、それ以外は `pnpm run test:e2e` を回す
 * （docs/testing.md 第1章）。
 *
 * 文書 = `docs/` の下と `*.md`。`data/` は含めない（CI は `data/` も飛ばすが、手元では飛ばさない）。
 * 判断に迷うとき（空・git が失敗）は、飛ばさず回す側に倒す。
 * 条件を変えるときは、CI の `.github/workflows/ci.yml`（「E2E の要否」）も合わせて直す。
 */

/** 1つ以上あり、全部が文書のときだけ true。 */
export function isDocsOnly(paths: string[]): boolean {
	return paths.length > 0 && paths.every((p) => /^docs\//.test(p) || /\.md$/.test(p));
}

const git = (args: string[]) =>
	execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' })
		.split('\n')
		.filter((line) => line !== '');

/**
 * 基準との分岐点から作業ツリーまでの変更。コミット済みの差分に、未追跡の新しいファイルを足す。
 * `scripts/review/git.ts` の readChanges は rename を検出し、移動元が出ない。
 * src/ から docs/ への移動が文書だけの変更に見えてしまうので、ここでは `--no-renames` で自前に集める。
 */
function changedPaths(base: string): string[] {
	const mergeBase = git(['merge-base', base, 'HEAD'])[0];
	const tracked = git(['diff', '--name-only', '--no-renames', mergeBase]);
	const untracked = git(['ls-files', '--others', '--exclude-standard']);
	return [...new Set([...tracked, ...untracked])];
}

function runE2e(): never {
	// pnpm は Windows では .cmd で、shell 無しでは起動できない（e2e/seed.ts と同じ）。
	const result = spawnSync('pnpm run test:e2e', { stdio: 'inherit', shell: true });
	process.exit(result.status ?? 1);
}

function main(): never {
	const base = process.env.VERIFY_BASE ?? 'origin/main';
	let paths: string[];
	try {
		paths = changedPaths(base);
	} catch (error) {
		const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
		console.log(`変更を調べられなかったので E2E を回す（基準 ${base}: ${reason}）`);
		return runE2e();
	}
	if (isDocsOnly(paths)) {
		console.log(
			`文書だけの変更（${paths.length} ファイル）なので E2E を飛ばす（docs/testing.md 第1章）`
		);
		process.exit(0);
	}
	return runE2e();
}

// 純関数は import して使う（単体テスト）。直接起動されたときだけ流す。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
