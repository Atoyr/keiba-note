/**
 * レビューの計画に渡す差分を git から読む。
 *
 * - 手元（`review:plan`）: 基準との分岐点から**作業ツリーまで**。コミット前の変更と、まだ git に
 *   載せていない新しいファイルも入れる。PR を出す前に回すので、コミット済みかどうかを問わない
 * - CI（`pr:check`）: 基準から HEAD まで。作業ツリーは無い
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseDiff, type ChangedFile } from './plan.ts';

function git(args: string[]): string {
	// 日本語のファイル名を `\343\201...` にしない。
	return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024
	});
}

export function readChanges(base: string, { worktree }: { worktree: boolean }): ChangedFile[] {
	if (!worktree) {
		return parseDiff(git(['diff', '--no-color', '--unified=0', `${base}...HEAD`]));
	}
	const fork = git(['merge-base', base, 'HEAD']).trim();
	const files = parseDiff(git(['diff', '--no-color', '--unified=0', fork]));
	const untracked = git(['ls-files', '--others', '--exclude-standard'])
		.split('\n')
		.map((f) => f.trim())
		.filter(Boolean);
	for (const path of untracked) {
		let text = '';
		try {
			text = readFileSync(path, 'utf8');
		} catch {
			// 読めないもの（消えた・権限）は名前だけで規則に当てる。
		}
		// 画像などは行として読まない。
		const added = text.includes('\0') ? [] : text.replace(/\r\n/g, '\n').split('\n');
		files.push({ path, added, removed: [] });
	}
	return files;
}
