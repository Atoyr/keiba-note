import { describe, expect, it } from 'vitest';
import {
	formatPlan,
	hasReviewResult,
	parseDiff,
	parseOverrides,
	planReview,
	type ChangedFile
} from './plan';
import type { Reviewer } from './rules';

const file = (path: string, added: string[] = ['x'], removed: string[] = []): ChangedFile => ({
	path,
	added,
	removed
});

/** レビュアーごとの重さ（0〜3）。 */
function weights(files: ChangedFile[]): Record<Reviewer, number> {
	const plan = planReview(files);
	return Object.fromEntries(plan.reviewers.map((r) => [r.reviewer, r.weight])) as Record<
		Reviewer,
		number
	>;
}

describe('parseDiff', () => {
	it('ファイルごとに追加行と削除行を分ける。消したファイルは元の名前で残す', () => {
		const text = [
			'diff --git a/data/races/2026-09-27.yaml b/data/races/2026-09-27.yaml',
			'index 111..222 100644',
			'--- a/data/races/2026-09-27.yaml',
			'+++ b/data/races/2026-09-27.yaml',
			'@@ -3 +3,2 @@ races:',
			'-        ref: nk-2022-1',
			'+        ref: nk-2022-2',
			'+    withdrawn:',
			'diff --git a/src/old.ts b/src/old.ts',
			'deleted file mode 100644',
			'--- a/src/old.ts',
			'+++ /dev/null',
			'@@ -1 +0,0 @@',
			'--- 先頭が --- の行も中身として読む',
			'\\ No newline at end of file'
		].join('\n');

		expect(parseDiff(text)).toEqual([
			{
				path: 'data/races/2026-09-27.yaml',
				added: ['        ref: nk-2022-2', '    withdrawn:'],
				removed: ['        ref: nk-2022-1']
			},
			{ path: 'src/old.ts', added: [], removed: ['-- 先頭が --- の行も中身として読む'] }
		]);
	});
});

describe('planReview — 出走馬データ', () => {
	it('ふつうの追記は中。取り下げ・ref の書き換え・空に戻すのは重', () => {
		expect(weights([file('data/races/2026-09-27.yaml', ['  - name: ホースA'])]).yaml).toBe(2);
		expect(weights([file('data/races/2026-09-27.yaml', ['    withdrawn:'])]).yaml).toBe(3);
		expect(weights([file('data/races/2026-09-27.yaml', [], ['        ref: nk-1'])]).yaml).toBe(3);
		expect(
			weights([file('data/races/2026-09-27.yaml', ['    entries: []'], ['    entries:'])]).yaml
		).toBe(3);
	});

	it('ref を足すだけ・プレースホルダを埋めるだけなら重くしない', () => {
		const filling = file(
			'data/races/2026-12-27.yaml',
			['    entries:', '      - name: ホースA', '        ref: nk-2022-1'],
			['    entries: []']
		);
		expect(weights([filling]).yaml).toBe(2);
	});

	it('見本のデータは軽', () => {
		expect(weights([file('data/examples/2026-05-10.yaml')]).yaml).toBe(1);
	});
});

describe('planReview — SQL', () => {
	it('サービス層は中。誰のデータかの絞り込みに触れたら重', () => {
		expect(weights([file('src/lib/server/services/races.ts', ['.orderBy(race.date)'])]).sql).toBe(
			2
		);
		expect(
			weights([file('src/lib/server/services/notes.ts', ['eq(note.authorId, viewerId)'])]).sql
		).toBe(3);
	});

	it('スキーマとマイグレーションは重。drizzle/meta は誰にも見せない', () => {
		const plan = planReview([
			file('src/lib/server/db/schema.ts'),
			file('drizzle/0019_x.sql'),
			file('drizzle/meta/_journal.json')
		]);
		expect(plan.reviewers.find((r) => r.reviewer === 'sql')?.weight).toBe(3);
		expect(plan.ignored).toEqual(['drizzle/meta/_journal.json']);
	});

	it('Drizzle の削除は重。cookies.delete は SQL に数えない', () => {
		expect(
			weights([file('src/lib/server/services/races.ts', ['\t\t.delete(raceEntry)'])]).sql
		).toBe(3);
		expect(
			weights([
				file('src/routes/auth/logout/+server.ts', [
					"cookies.delete(SESSION_COOKIE, { path: '/' });"
				])
			]).sql
		).toBe(0);
	});
});

describe('planReview — フロント', () => {
	it('画面は中。画面側から $lib/server を import したら重', () => {
		expect(weights([file('src/routes/races/+page.svelte', ['<p>{data.name}</p>'])]).frontend).toBe(
			2
		);
		expect(
			weights([
				file('src/lib/components/NoteCard.svelte', ["import type { Db } from '$lib/server/db';"])
			]).frontend
		).toBe(3);
	});

	it('+page.server.ts が $lib/server を読むのは当然なので重くしない', () => {
		expect(
			weights([
				file('src/routes/races/+page.server.ts', ["import { ctx } from '$lib/server/util';"])
			]).frontend
		).toBe(2);
	});

	it('認証の判断は重', () => {
		expect(weights([file('src/hooks.server.ts')]).frontend).toBe(3);
	});
});

describe('planReview — AI プロンプト', () => {
	it('エージェントの定義は中、権限（tools）に触れたら重。分野の文書は軽', () => {
		expect(weights([file('.claude/agents/evaluator.md', ['あなたは…'])]).prompt).toBe(2);
		expect(weights([file('.claude/agents/evaluator.md', ['tools: Read, Edit'])]).prompt).toBe(3);
		expect(weights([file('docs/product.md', ['文'])]).prompt).toBe(1);
	});

	it('取り消しにくい操作に触れた指示は重', () => {
		expect(weights([file('AGENTS.md', ['pnpm run data:import:remote を叩く'])]).prompt).toBe(3);
		// スキルが最初に読む data/README.md も同じ
		expect(weights([file('data/README.md', ['pnpm run data:import:remote'])]).prompt).toBe(3);
		expect(weights([file('data/README.md', ['書式の説明'])]).prompt).toBe(1);
	});
});

describe('planReview — 重さを下げる', () => {
	it('テストだけのファイルは、何に当たっても軽まで', () => {
		const w = weights([
			file('src/lib/server/services/notes.spec.ts', ["DELETE FROM note WHERE id='x'"])
		]);
		expect(w.sql).toBe(1);
	});

	it('コメントと空行だけの変更は軽まで', () => {
		const w = weights([
			file(
				'src/lib/server/services/notes.ts',
				['\t// viewerId を必須にする理由', ''],
				['\t// 古い説明']
			)
		]);
		expect(w.sql).toBe(1);
	});

	it('どの規則にも当たらないファイルは、名前を出して人に回す', () => {
		const plan = planReview([file('wrangler.toml')]);
		expect(plan.unmatched).toEqual(['wrangler.toml']);
		expect(plan.reviewers.every((r) => r.weight === 0)).toBe(true);
	});
});

describe('重さを人が変える', () => {
	it('--weight で変えた重さと、規則の重さを両方残す', () => {
		const plan = planReview(
			[file('src/routes/races/+page.svelte')],
			parseOverrides(['frontend=重', 'sql=軽'])
		);
		expect(plan.reviewers.find((r) => r.reviewer === 'frontend')).toMatchObject({
			weight: 3,
			ruleWeight: 2
		});
		expect(plan.reviewers.find((r) => r.reviewer === 'sql')).toMatchObject({
			weight: 1,
			ruleWeight: 0
		});
	});

	it('読めない指定は投げる', () => {
		expect(() => parseOverrides(['db=重'])).toThrow('レビュアーは');
		expect(() => parseOverrides(['sql=とても重い'])).toThrow('重さは');
		expect(parseOverrides(['sql=-,yaml=2'])).toEqual({ sql: 0, yaml: 2 });
	});
});

describe('hasReviewResult', () => {
	it('結果の見出しか「未実施」の行があれば通す。計画の表だけでは通さない', () => {
		const planOnly = formatPlan(planReview([file('src/lib/server/db/schema.ts')]), 'origin/main');
		expect(planOnly).toContain('reviewer-sql');
		expect(hasReviewResult(planOnly, 'reviewer-sql')).toBe(false);

		expect(
			hasReviewResult('### コードレビュー（reviewer-sql・重）\n\n指摘なし', 'reviewer-sql')
		).toBe(true);
		expect(
			hasReviewResult('reviewer-sql: 未実施（サブエージェントが使えない）', 'reviewer-sql')
		).toBe(true);
		expect(hasReviewResult('- `reviewer-sql`：未実施（理由）', 'reviewer-sql')).toBe(true);
		expect(hasReviewResult('### コードレビュー（reviewer-yaml・中）', 'reviewer-sql')).toBe(false);
	});

	it('理由の無い「未実施」は通さない', () => {
		expect(hasReviewResult('reviewer-sql: 未実施', 'reviewer-sql')).toBe(false);
		expect(hasReviewResult('reviewer-sql: 未実施（）', 'reviewer-sql')).toBe(false);
	});
});

describe('formatPlan', () => {
	it('起動するレビュアーとモデル、起動しないレビュアーを表にする', () => {
		const text = formatPlan(
			planReview([
				file('src/lib/server/services/notes.ts', ['viewerId']),
				file('src/lib/server/services/races.ts', ['viewerId']),
				file('src/lib/server/services/horses.ts', ['viewerId']),
				file('docs/product.md')
			]),
			'origin/main'
		);
		expect(text).toContain(
			'| reviewer-sql（SQL） | 重 | model: opus | 誰のデータかの絞り込み（`src/lib/server/services/notes.ts`・`src/lib/server/services/races.ts` ほか 1 件） |'
		);
		expect(text).toContain('| reviewer-prompt（AI プロンプト） | 軽 | model: sonnet |');
		expect(text).toContain('| reviewer-yaml（YAML） | — | 起動しない |  |');
		expect(text).toContain('<summary>reviewer-sql の対象（3 ファイル）</summary>');
	});

	it('何も当たらなければそう書く', () => {
		expect(formatPlan(planReview([]), 'origin/main')).toContain(
			'どのレビュアーにも当たる変更がありません'
		);
	});
});
