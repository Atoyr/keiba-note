import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E 専用のローカル D1 の置き場。開発用の `.wrangler/state` とは分けてある。
 *
 * 同じ D1 を使うと、手元で `data:import:local` した本物の出馬表や `pnpm run dev` で
 * 書いたメモが E2E とキャプチャに混ざり、人によって・日によって結果が変わる。
 * プレビューサーバー（playwright.config.ts の webServer）も同じ場所を見る。
 */
export const E2E_STATE = '.wrangler/e2e';

// 固定の文字列なので shell に渡して問題ない（pnpm は Windows では .cmd で、
// shell 無しでは起動できない）。
const wrangler = (args: string) =>
	execSync(`pnpm exec wrangler ${args} --local --persist-to ${E2E_STATE}`, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});

/**
 * E2E の前に、E2E 専用 D1 を「マイグレーション済み・seed.sql の行だけ」にする
 * （playwright.config.ts の `globalSetup`）。
 *
 * 全テーブルを空にしてから流すので、前回のテストが書いた行は残らない。
 * テーブル名はその場で引くので、テーブルを足しても ここを直す必要はない。
 */
export default function seed() {
	wrangler('d1 migrations apply k-note');

	const [{ results }] = JSON.parse(
		wrangler(
			`d1 execute k-note --json --command "SELECT name FROM sqlite_master WHERE type = 'table'"`
		)
	) as [{ results: { name: string }[] }];

	// D1 / SQLite が内部で使う表（_cf_*, sqlite_*）と、適用済みマイグレーションの記録は残す。
	const tables = results
		.map(({ name }) => name)
		.filter((name) => !/^(_cf_|sqlite_)/.test(name) && name !== 'd1_migrations');

	const reset = [
		'PRAGMA defer_foreign_keys = true;',
		...tables.map((name) => `DELETE FROM "${name}";`)
	].join('\n');

	mkdirSync(E2E_STATE, { recursive: true });
	const file = join(E2E_STATE, 'seed.sql');
	writeFileSync(file, `${reset}\n\n${readFileSync('e2e/seed.sql', 'utf8')}`);
	wrangler(`d1 execute k-note --file ${file}`);
}

/** 共有中のメモ。`/notes/[id]` で開ける。 */
export const SHARED_NOTE_ID = '01JE2ESHAREDNOTE0000000000';

/** 非公開のメモ。存在するが `/notes/[id]` では 404 になる。 */
export const PRIVATE_NOTE_ID = '01JE2EPRIVATENOTE000000000';

/** タイムラインを見る馬。出走3走のうち、メモが付いているのは1走だけ。 */
export const HORSE_ID = '01JE2EHORSE000000000000000';

/** ふりかえり画面を開くレース。出走1頭（着順まで入っている）。 */
export const REVIEW_RACE_ID = '01JE2ERACEPAST0000000000000';

/** ふりかえり画面を開くレース。**出走馬が1頭も登録されていない。** */
export const EMPTY_RACE_ID = '01JE2ERACEEMPTY00000000000';

/**
 * ダッシュボードのレース欄に出るレース名。**日付は seed を流した日から決まる**
 * （今日 / 10日前 / 40日前）。40日前のものは「直近3週」の窓の外に出る。
 */
export const DASHBOARD_RACES = {
	thisWeek: 'E2E今週賞',
	inWindow: 'E2E先週賞',
	outOfWindow: 'E2E昔賞'
} as const;

/** 予想画面を開くレース。出走1頭に、出走前メモが1件だけ付いている。 */
export const PREVIEW_RACE_ID = '01JE2ERACEPREVIEW000000000';

/** 枠の色を見るレース。出走2頭の枠は1枠（白）と8枠（桃）。 */
export const BRACKET_RACE_ID = '01JE2ERACEBRACKET000000000';

/**
 * ログイン済みで開くためのセッショントークン。**Cookie に入れる生の値。**
 *
 * DB には SHA-256 した値しか無い（`hashSessionToken`）ので、seed.sql の id と
 * この文字列は見た目が一致しない。ここを変えるなら両方を直すこと。
 *
 * 本番ビルドにモック認証は存在しない（`dev` ガードで消える）ため、
 * ログインが要る画面を E2E で見るにはセッションを1本置くしかない。
 */
export const SESSION_TOKEN = 'e2esessiontoken00000000000000000';
