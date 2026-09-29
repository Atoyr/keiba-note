/**
 * どの変更を、どのレビュアーに、どの重さで見せるかの規則（docs/review.md 第2章）。
 *
 * 規則はファイルのパスと、変わった行の中身で当たる。レビュアーの重さは、当たった規則のうち
 * いちばん重いもの。同じ見落としが2回あったら、ここに規則を足すか重さを上げる（docs/harness.md 6-4）。
 * 足したら `plan.spec.ts` に例を1つ足す。
 */

export const REVIEWERS = ['yaml', 'sql', 'frontend', 'prompt'] as const;
export type Reviewer = (typeof REVIEWERS)[number];

/** 0: 起動しない / 1: 軽 / 2: 中 / 3: 重 */
export type Weight = 0 | 1 | 2 | 3;
export const WEIGHT_LABELS = ['—', '軽', '中', '重'] as const;

/** `.claude/agents/` のエージェント名と、表に出す呼び名。 */
export const AGENTS: Record<Reviewer, { agent: string; label: string }> = {
	yaml: { agent: 'reviewer-yaml', label: 'YAML' },
	sql: { agent: 'reviewer-sql', label: 'SQL' },
	frontend: { agent: 'reviewer-frontend', label: 'フロント' },
	prompt: { agent: 'reviewer-prompt', label: 'AI プロンプト' }
};

/**
 * 重さごとに起動するモデル（Claude Code の Agent の `model`）。
 * 軽は ★ の観点だけを見るので速いモデルで足りる。中と重は見る範囲が違うだけで、同じモデルで読む。
 */
export const MODELS: Record<Exclude<Weight, 0>, 'sonnet' | 'opus'> = {
	1: 'sonnet',
	2: 'opus',
	3: 'opus'
};

export interface Rule {
	reviewer: Reviewer;
	/** リポジトリ直下からのパス（区切りは `/`）。 */
	path: RegExp;
	/** 変わった行にこれがあれば当たる。無ければパスだけで当たる。 */
	content?: RegExp;
	/** `content` を見る側。既定は追加と削除の両方。消したことに意味があるもの（ref など）は `removed`。 */
	side?: 'added' | 'removed';
	weight: Exclude<Weight, 0>;
	reason: string;
}

/** 誰にも見せないもの。生成物・ロックファイル・画像。 */
export const IGNORED = [
	/^pnpm-lock\.yaml$/,
	/^drizzle\/meta\//,
	/^docs\/screenshots\//,
	/^src\/lib\/assets\/courses\//,
	/^worker-configuration\.d\.ts$/
];

/** テストだけのファイル。どの規則に当たっても軽までにする（本番の挙動は変えない）。 */
export const TEST_FILE = /(\.(spec|test)\.ts$)|(^e2e\/.*\.ts$)|(^scripts\/.*\/fixtures\/)/;

/**
 * 取り消しにくい操作。指示文でもワークフローでも、ここに触れたら重。
 * `:remote` は `data:import:remote`・`db:migrate:remote` のような pnpm のスクリプト名。
 */
const IRREVERSIBLE =
	/--remote|:remote\b|wrangler (deploy|secret)|run deploy|--force|force push|secrets\./;

export const RULES: Rule[] = [
	// ── YAML: 出走馬データ（main にマージすると本番に入る）と、CI・自動実行 ──
	{
		reviewer: 'yaml',
		path: /^data\/races\/.+\.ya?ml$/,
		weight: 2,
		reason: '本番に入る出走馬データ'
	},
	{
		reviewer: 'yaml',
		path: /^data\/races\/.+\.ya?ml$/,
		content: /^\s*withdrawn:/,
		side: 'added',
		weight: 3,
		reason: '取り下げ（出走馬行が消え、メモが近況メモへ移る）'
	},
	{
		reviewer: 'yaml',
		path: /^data\/races\/.+\.ya?ml$/,
		content: /^\s*(-\s*)?ref:/,
		side: 'removed',
		weight: 3,
		reason: 'ref（馬・レースの同一性）を変えた・消した'
	},
	{
		reviewer: 'yaml',
		path: /^data\/races\/.+\.ya?ml$/,
		content: /^\s*entries:\s*$|^date:/,
		side: 'removed',
		weight: 3,
		reason: '出走馬の並びを空に戻した・開催日の付け替えかファイルの削除'
	},
	{
		reviewer: 'yaml',
		path: /^data\/examples\/.+\.ya?ml$/,
		weight: 1,
		reason: '書式の見本（本番に入らない）'
	},
	{
		reviewer: 'yaml',
		path: /^scripts\/race-data(\.ts$|\/)/,
		weight: 2,
		reason: 'netkeiba から YAML を書くスクリプト'
	},
	{
		reviewer: 'yaml',
		path: /^\.github\/workflows\/.+\.ya?ml$/,
		weight: 2,
		reason: 'CI・自動実行'
	},
	{
		reviewer: 'yaml',
		path: /^\.github\/workflows\/.+\.ya?ml$/,
		content: new RegExp(
			`permissions:|pull_request_target|CLOUDFLARE_|\\$\\{\\{[^}]*github\\.event|${IRREVERSIBLE.source}`
		),
		weight: 3,
		reason: '権限・シークレット・本番への操作・外から来る値'
	},
	{
		reviewer: 'yaml',
		path: /^(pnpm-workspace\.yaml|\.github\/[^/]+\.ya?ml)$/,
		weight: 1,
		reason: 'リポジトリの設定'
	},

	// ── SQL: スキーマ・マイグレーション・問い合わせ・SQL を組むスクリプト ──
	{
		reviewer: 'sql',
		path: /^src\/lib\/server\/db\/schema\.ts$/,
		weight: 3,
		reason: 'スキーマ（本番のテーブル）'
	},
	{
		reviewer: 'sql',
		path: /^drizzle\/.+\.sql$/,
		weight: 3,
		reason: 'マイグレーション（本番の D1 に流れる）'
	},
	{
		reviewer: 'sql',
		path: /^src\/lib\/server\/db\//,
		weight: 2,
		reason: 'D1 クライアント'
	},
	{
		reviewer: 'sql',
		path: /^src\/lib\/server\/services\//,
		weight: 2,
		reason: 'サービス層（SQL の組み立て）'
	},
	{
		reviewer: 'sql',
		path: /^src\/lib\/server\/(services|db)\//,
		content: /author_id|authorId|viewerId|user_id|visibility/,
		weight: 3,
		reason: '誰のデータかの絞り込み'
	},
	{
		reviewer: 'sql',
		// scripts/review/ はこの規則そのものの文字列を持つので除く。
		path: /^(src|scripts)\/(?!review\/).+\.ts$/,
		// Drizzle の削除は `db.delete(` か、改行して `.delete(` で始まる行。`cookies.delete(` は拾わない。
		content: /^\s*\.delete\(|\b(db|tx)\.delete\(|DELETE FROM|sql\.raw\(|\bDROP\s|ON DELETE/,
		weight: 3,
		reason: '生の SQL・削除'
	},
	{
		reviewer: 'sql',
		path: /^src\/lib\/server\/auth\//,
		weight: 3,
		reason: 'セッション・ログイン'
	},
	{
		reviewer: 'sql',
		path: /^scripts\/import-races\.(spec\.)?ts$/,
		weight: 3,
		reason: '本番へ投入する SQL を組む'
	},
	{
		reviewer: 'sql',
		path: /^scripts\/odds\/(store|update)\.ts$|^scripts\/odds-update\.ts$/,
		weight: 2,
		reason: '本番の D1 に書くオッズの SQL'
	},
	{
		reviewer: 'sql',
		path: /^src\/routes\/.+\.ts$/,
		content: /from 'drizzle-orm|db\.(select|insert|update|delete|run|batch)\(/,
		side: 'added',
		weight: 2,
		reason: 'ルートで SQL を組んでいる（サービス層に置く約束）'
	},
	{
		reviewer: 'sql',
		path: /^e2e\/(landing\/)?seed\.sql$/,
		weight: 1,
		reason: 'E2E の seed'
	},

	// ── フロント: 画面・ルート・部品・入力の検証 ──
	{
		reviewer: 'frontend',
		path: /^src\/routes\/.+\.svelte$/,
		weight: 2,
		reason: '画面'
	},
	{
		reviewer: 'frontend',
		path: /^src\/routes\/.+\.ts$/,
		weight: 2,
		reason: 'ルート（load・action）'
	},
	{
		reviewer: 'frontend',
		path: /^src\/lib\/components\/(?!ui\/)/,
		weight: 2,
		reason: '部品'
	},
	{
		reviewer: 'frontend',
		path: /^src\/lib\/components\/ui\//,
		weight: 2,
		reason: 'shadcn の生成物（手で直さない。CLI で入れ直したものか）'
	},
	{
		reviewer: 'frontend',
		path: /^src\/lib\/(schemas|utils)\/|^src\/app\.(html|css|d\.ts)$/,
		weight: 2,
		reason: '入力の検証・画面のヘルパー'
	},
	{
		reviewer: 'frontend',
		path: /^src\/hooks\.server\.ts$/,
		weight: 3,
		reason: '認証の判断'
	},
	{
		reviewer: 'frontend',
		path: /^src\//,
		content: /PUBLIC_PATHS|safeRedirect|\{@html/,
		weight: 3,
		reason: 'ログイン不要のパス・外への飛び先・生の HTML'
	},
	{
		reviewer: 'frontend',
		path: /^src\/(routes|lib\/components|lib\/utils)\/(?!.*\.server\.ts$)/,
		content: /\$lib\/server/,
		side: 'added',
		weight: 3,
		reason: '画面側からサーバーのコードを import している'
	},
	{
		reviewer: 'frontend',
		path: /^e2e\//,
		weight: 1,
		reason: 'E2E・画面カタログ'
	},

	// ── AI プロンプト: エージェントが読んで従う文 ──
	{
		reviewer: 'prompt',
		path: /^(AGENTS|CLAUDE)\.md$/,
		weight: 2,
		reason: '毎回読まれる指示'
	},
	{
		reviewer: 'prompt',
		path: /^\.claude\/(agents|skills|commands)\//,
		weight: 2,
		reason: 'サブエージェント・スキル・コマンドの定義'
	},
	{
		// hook・launch.json など、上に無い Claude Code の設定もエージェントの動きを変える。
		reviewer: 'prompt',
		path: /^\.claude\/(?!agents\/|skills\/|commands\/|worktrees\/)/,
		weight: 2,
		reason: 'Claude Code の設定'
	},
	{
		reviewer: 'prompt',
		path: /^\.claude\/agents\//,
		content: /^(tools|model):/,
		weight: 3,
		reason: 'エージェントの権限・モデル'
	},
	{
		reviewer: 'prompt',
		path: /^\.claude\/settings(\.local)?\.json$/,
		weight: 3,
		reason: '権限・hook'
	},
	{
		reviewer: 'prompt',
		path: /^docs\/(architecture|evaluation|review|testing)\.md$/,
		weight: 2,
		reason: '守ること・評価とレビュー・検証の約束'
	},
	{
		reviewer: 'prompt',
		path: /^(docs\/.+|data\/README|\.github\/pull_request_template)\.md$|^\.github\/ISSUE_TEMPLATE\//,
		weight: 1,
		reason: 'エージェントが読む文書・テンプレート'
	},
	{
		reviewer: 'prompt',
		path: /^(AGENTS\.md|CLAUDE\.md|\.claude\/|docs\/|data\/README\.md$|\.github\/(pull_request_template\.md$|ISSUE_TEMPLATE\/))/,
		content: IRREVERSIBLE,
		weight: 3,
		reason: '取り消しにくい操作（本番・デプロイ・シークレット・force）'
	},
	{
		reviewer: 'prompt',
		path: /^scripts\/(check-docs|check-pr-body)\.ts$|^scripts\/review(-plan\.ts$|\/)/,
		weight: 1,
		reason: '文書・PR 本文・レビューの機械の検査'
	}
];
