/**
 * PR を出す前に、どのレビュアーを、どの重さで起動するかを出す（docs/review.md）。
 *
 *   pnpm run review:plan                         # origin/main との差分（コミット前の変更も含む）
 *   pnpm run review:plan --base main             # 基準を変える
 *   pnpm run review:plan --weight sql=重         # 重さを人が変える（理由は PR 本文に書く）
 *   pnpm run review:plan --json                  # エージェントが読む形
 *
 * 出力の Markdown は PR 本文の「## コードレビュー」の下にそのまま貼る。
 */
import { readChanges } from './review/git.ts';
import { formatPlan, parseOverrides, planReview } from './review/plan.ts';

const args = process.argv.slice(2);
let base = 'origin/main';
let json = false;
const weights: string[] = [];
for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === '--') continue;
	else if (arg === '--json') json = true;
	else if (arg === '--base') base = args[++i];
	else if (arg === '--weight') weights.push(args[++i]);
	else {
		console.error(`分からない引数です: ${arg}`);
		process.exit(2);
	}
}

let overrides;
try {
	overrides = parseOverrides(weights);
} catch (e) {
	console.error((e as Error).message);
	process.exit(2);
}

const plan = planReview(readChanges(base, { worktree: true }), overrides);
console.log(json ? JSON.stringify({ base, ...plan }, null, '\t') : formatPlan(plan, base));
