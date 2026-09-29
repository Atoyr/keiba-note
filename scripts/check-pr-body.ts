/**
 * PR 本文の欄が埋まっているかを確かめる（docs/harness.md 5-5）。
 *
 *   PR_BODY="$(gh pr view 41 --json body --jq .body)" pnpm run pr:check
 *   PR_BODY="…" REVIEW_BASE=origin/main pnpm run pr:check   # レビュアーの検査も（CI と同じ）
 *
 * CI では `.github/workflows/pr-body.yml` が本文を環境変数で渡して回す。
 * 「画面」と「評価」は、人がキャプチャと評価だけを見て判断するための欄なので、
 * 空のまま出されると人が中身を探しに行くことになる。空かどうかは機械で見られる。
 *
 * 見るのは欄が空でないこと（と、下のレビュアーの結果の有無）だけ。中身の良し悪しは人と Evaluator が見る。
 *
 * `REVIEW_BASE`（比べる基準のコミット）を渡すと、その差分で `review:plan` と同じ計画を立て、
 * 起動すべきレビュアーの結果が「コードレビュー」にあるかも見る（docs/review.md 第6章）。
 * 結果の見出しか、起動できなかった理由（`reviewer-sql: 未実施`）のどちらかがあればよい。
 * `review:plan` の表は全レビュアーの名前を出すので、名前が含まれるかだけでは見ない。
 */
import { AGENTS, WEIGHT_LABELS } from './review/rules.ts';
import { readChanges } from './review/git.ts';
import { hasReviewResult, planReview } from './review/plan.ts';

/** `.github/pull_request_template.md` の見出しのうち、空にしてはいけないもの。 */
const REQUIRED = [
	'何を変えたか',
	'レビューで見てほしいところ',
	'なぜ',
	'画面',
	'評価',
	'コードレビュー'
];

const body = process.env.PR_BODY;
if (body === undefined) {
	console.error('PR_BODY に PR 本文を入れて実行してください');
	process.exit(2);
}

// テンプレートの説明（HTML コメント）は中身に数えない。
const text = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n');

/** `## 見出し` ごとの中身。 */
const sections = new Map<string, string>();
let current: string | null = null;
for (const line of text.split('\n')) {
	const heading = line.match(/^##\s+(.+?)\s*$/);
	if (heading) {
		current = heading[1];
		sections.set(current, '');
	} else if (current) {
		sections.set(current, sections.get(current) + line + '\n');
	}
}

const problems = REQUIRED.flatMap((name) => {
	const content = sections.get(name);
	if (content === undefined) return [`「## ${name}」の見出しがありません`];
	if (content.trim() === '') return [`「## ${name}」が空です`];
	return [];
});

const reviewBase = process.env.REVIEW_BASE;
const reviewSection = sections.get('コードレビュー') ?? '';
if (reviewBase) {
	let changes;
	try {
		changes = readChanges(reviewBase, { worktree: false });
	} catch (e) {
		console.error(
			`REVIEW_BASE（${reviewBase}）との差分が取れません。基準のコミットまで fetch されているか` +
				`（CI なら checkout の fetch-depth）を確かめてください。\n${(e as Error).message}`
		);
		process.exit(2);
	}
	for (const r of planReview(changes).reviewers) {
		const { agent } = AGENTS[r.reviewer];
		if (r.weight > 0 && !hasReviewResult(reviewSection, agent)) {
			problems.push(
				`「## コードレビュー」に ${agent}（${WEIGHT_LABELS[r.weight]}）の結果がありません。` +
					`「### コードレビュー（${agent}・…）」の結果を貼るか、` +
					`起動できなかった理由を「${agent}: 未実施（理由）」と書いてください`
			);
		}
	}
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	console.error('\nPR 本文を .github/pull_request_template.md の見出しに沿って埋めてください。');
	process.exit(1);
}
console.log(`PR 本文: ${REQUIRED.length} つの欄が埋まっています。`);
