/**
 * PR 本文の欄が埋まっているかを確かめる（docs/harness.md 5-5）。
 *
 *   PR_BODY="$(gh pr view 41 --json body --jq .body)" pnpm run pr:check
 *
 * CI では `.github/workflows/pr-body.yml` が本文を環境変数で渡して回す。
 * 「画面」と「評価」は、人がキャプチャと評価だけを見て判断するための欄なので、
 * 空のまま出されると人が中身を探しに行くことになる。空かどうかは機械で見られる。
 *
 * 見るのは欄が空でないことだけ。中身の良し悪しは人と Evaluator が見る。
 */

/** `.github/pull_request_template.md` の見出しのうち、空にしてはいけないもの。 */
const REQUIRED = ['何を変えたか', 'レビューで見てほしいところ', 'なぜ', '画面', '評価'];

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

if (problems.length > 0) {
	console.error(problems.join('\n'));
	console.error('\nPR 本文を .github/pull_request_template.md の見出しに沿って埋めてください。');
	process.exit(1);
}
console.log(`PR 本文: ${REQUIRED.length} つの欄が埋まっています。`);
