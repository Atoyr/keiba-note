/**
 * 差分から「どのレビュアーを、どの重さで起動するか」を決める（docs/review.md 第2章）。
 * git は読まない。差分の文字列を受け取るだけにして、単体テストで規則を確かめられるようにする。
 */
import {
	AGENTS,
	IGNORED,
	MODELS,
	REVIEWERS,
	RULES,
	TEST_FILE,
	WEIGHT_LABELS,
	type Reviewer,
	type Rule,
	type Weight
} from './rules.ts';

export interface ChangedFile {
	path: string;
	added: string[];
	removed: string[];
}

export interface Hit {
	file: string;
	weight: Weight;
	reason: string;
}

export interface ReviewerPlan {
	reviewer: Reviewer;
	weight: Weight;
	/** 人が `--weight` で変えたときの、規則で決まった重さ。 */
	ruleWeight?: Weight;
	hits: Hit[];
	files: string[];
}

export interface ReviewPlan {
	reviewers: ReviewerPlan[];
	/** どの規則にも当たらないファイル。人が見るか `/code-review` に回す。 */
	unmatched: string[];
	ignored: string[];
}

/** `git diff` の出力を、ファイルごとの追加行と削除行に分ける。 */
export function parseDiff(text: string): ChangedFile[] {
	const files: ChangedFile[] = [];
	let current: ChangedFile | null = null;
	let inHunk = false;
	for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
		const header = line.match(/^diff --git a\/(.*) b\/(.*)$/);
		if (header) {
			current = { path: header[2], added: [], removed: [] };
			files.push(current);
			inHunk = false;
			continue;
		}
		if (!current) continue;
		if (!inHunk) {
			// 消したファイルは `+++ /dev/null` になるので、`---` の側の名前を残す。
			const to = line.match(/^\+\+\+ b\/(.*)$/);
			if (to) current.path = to[1];
			if (line.startsWith('@@')) inHunk = true;
			continue;
		}
		if (line.startsWith('@@')) continue;
		if (line.startsWith('+')) current.added.push(line.slice(1));
		else if (line.startsWith('-')) current.removed.push(line.slice(1));
	}
	return files;
}

/** 拡張子ごとの「コメントか空行」。Markdown と JSON は文そのものなので持たない。 */
const COMMENT: [RegExp, RegExp][] = [
	[/\.(ts|js|svelte)$/, /^\s*(\/\/|\/\*|\*|<!--|-->|$)/],
	[/\.(ya?ml|toml|sh)$/, /^\s*(#|$)/],
	[/\.sql$/, /^\s*(--|$)/]
];

/** 変わった行がコメントと空行だけか。そうなら挙動は変わらないので軽までにする。 */
export function commentOnly(file: ChangedFile): boolean {
	const pattern = COMMENT.find(([ext]) => ext.test(file.path))?.[1];
	if (!pattern) return false;
	const lines = [...file.added, ...file.removed];
	return lines.length > 0 && lines.every((l) => pattern.test(l));
}

function matches(rule: Rule, file: ChangedFile): boolean {
	if (!rule.path.test(file.path)) return false;
	if (!rule.content) return true;
	const lines =
		rule.side === 'added'
			? file.added
			: rule.side === 'removed'
				? file.removed
				: [...file.added, ...file.removed];
	return lines.some((l) => rule.content!.test(l));
}

export function planReview(
	files: ChangedFile[],
	overrides: Partial<Record<Reviewer, Weight>> = {},
	rules: Rule[] = RULES
): ReviewPlan {
	const hits = new Map<Reviewer, Hit[]>(REVIEWERS.map((r) => [r, []]));
	const unmatched: string[] = [];
	const ignored: string[] = [];

	for (const file of files) {
		if (IGNORED.some((p) => p.test(file.path))) {
			ignored.push(file.path);
			continue;
		}
		const capped = TEST_FILE.test(file.path) || commentOnly(file);
		const matched = rules.filter((r) => matches(r, file));
		if (matched.length === 0) unmatched.push(file.path);
		for (const rule of matched) {
			const weight = capped ? (Math.min(rule.weight, 1) as Weight) : rule.weight;
			hits.get(rule.reviewer)!.push({ file: file.path, weight, reason: rule.reason });
		}
	}

	const reviewers = REVIEWERS.map((reviewer): ReviewerPlan => {
		const mine = hits.get(reviewer)!.sort((a, b) => b.weight - a.weight);
		const ruleWeight = mine.reduce<Weight>((max, h) => (h.weight > max ? h.weight : max), 0);
		const files = [...new Set(mine.map((h) => h.file))];
		const override = overrides[reviewer];
		if (override !== undefined && override !== ruleWeight) {
			return { reviewer, weight: override, ruleWeight, hits: mine, files };
		}
		return { reviewer, weight: ruleWeight, hits: mine, files };
	});

	return { reviewers, unmatched, ignored };
}

/**
 * PR 本文の「コードレビュー」に、そのレビュアーの結果の見出しか「未実施」の行があるか。
 * 計画の表（全レビュアーの名前が並ぶ）だけでは通さない。
 */
export function hasReviewResult(section: string, agent: string): boolean {
	const heading = new RegExp(`^###\\s*コードレビュー（${agent}[・）]`, 'm');
	// 「未実施」だけでは通さない。理由を括弧で添える（docs/review.md 第0章）。
	const skipped = new RegExp(
		`^\\s*(-\\s*)?\`?${agent}\`?\\s*[:：]\\s*未実施\\s*[（(][^）)\\s]`,
		'm'
	);
	return heading.test(section) || skipped.test(section);
}

/** `sql=重` / `sql=3` / `frontend=—` を読む。読めなければ投げる。 */
export function parseOverrides(specs: string[]): Partial<Record<Reviewer, Weight>> {
	const result: Partial<Record<Reviewer, Weight>> = {};
	for (const spec of specs.flatMap((s) => s.split(','))) {
		const [name, value] = spec.split('=').map((s) => s.trim());
		if (!(REVIEWERS as readonly string[]).includes(name)) {
			throw new Error(`レビュアーは ${REVIEWERS.join(' / ')} のどれかです: ${spec}`);
		}
		const weight = parseWeight(value ?? '');
		if (weight === undefined) {
			throw new Error(
				`重さは ${WEIGHT_LABELS.join(' / ')}（または 0〜3）で書いてください: ${spec}`
			);
		}
		result[name as Reviewer] = weight;
	}
	return result;
}

function parseWeight(value: string): Weight | undefined {
	const index = (WEIGHT_LABELS as readonly string[]).indexOf(value === '-' ? '—' : value);
	if (index >= 0) return index as Weight;
	if (/^[0-3]$/.test(value)) return Number(value) as Weight;
	return undefined;
}

/** 同じ理由のファイルをまとめ、多ければ「ほか N 件」に畳む。 */
function summarize(hits: Hit[], weight: Weight, limit = 2): string[] {
	const byReason = new Map<string, string[]>();
	for (const h of hits.filter((h) => h.weight === weight)) {
		const files = byReason.get(h.reason) ?? [];
		if (!files.includes(h.file)) files.push(h.file);
		byReason.set(h.reason, files);
	}
	return [...byReason].map(([reason, files]) => {
		const shown = files.slice(0, limit).map((f) => `\`${f}\``);
		const rest = files.length > limit ? ` ほか ${files.length - limit} 件` : '';
		return `${reason}（${shown.join('・')}${rest}）`;
	});
}

/** PR 本文の「## コードレビュー」の下にそのまま貼れる Markdown。 */
export function formatPlan(plan: ReviewPlan, base: string): string {
	const out: string[] = [];
	const anything = plan.reviewers.some((r) => r.weight > 0) || plan.unmatched.length > 0;
	out.push('### レビューの計画（`pnpm run review:plan`）', '');
	out.push(`基準: \`${base}\``, '');
	if (!anything) {
		out.push('どのレビュアーにも当たる変更がありません。');
		return out.join('\n');
	}
	out.push('| レビュアー | 重さ | 起動 | おもな理由 |', '| --- | --- | --- | --- |');
	for (const r of plan.reviewers) {
		const { agent, label } = AGENTS[r.reviewer];
		const weight =
			r.ruleWeight === undefined
				? WEIGHT_LABELS[r.weight]
				: `${WEIGHT_LABELS[r.weight]}（規則では${WEIGHT_LABELS[r.ruleWeight]}。人が変えた）`;
		const run = r.weight === 0 ? '起動しない' : `model: ${MODELS[r.weight as 1 | 2 | 3]}`;
		const reasons =
			r.hits.length > 0 ? summarize(r.hits, r.ruleWeight ?? r.weight).join('<br>') : '';
		out.push(`| ${agent}（${label}） | ${weight} | ${run} | ${reasons} |`);
	}
	if (plan.unmatched.length > 0) {
		out.push(
			'',
			`どのレビュアーにも当たらないファイル（人が見るか \`/code-review\`）: ${plan.unmatched.map((f) => `\`${f}\``).join('・')}`
		);
	}
	for (const r of plan.reviewers.filter((r) => r.weight > 0)) {
		const { agent } = AGENTS[r.reviewer];
		out.push('', `<details><summary>${agent} の対象（${r.files.length} ファイル）</summary>`, '');
		for (const file of r.files) {
			const reasons = r.hits
				.filter((h) => h.file === file)
				.map((h) => `${h.reason}（${WEIGHT_LABELS[h.weight]}）`);
			out.push(`- \`${file}\` — ${reasons.join('・')}`);
		}
		out.push('', '</details>');
	}
	return out.join('\n');
}
