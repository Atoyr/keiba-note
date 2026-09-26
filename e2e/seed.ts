import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
 * E2E の前に、E2E 専用 D1 を「マイグレーション済み・seed.sql の行だけ」にする。
 *
 * 全テーブルを空にしてから流すので、前回のテストが書いた行は残らない。
 * テーブル名はその場で引くので、テーブルを足しても ここを直す必要はない。
 *
 * **プレビューサーバー（wrangler dev）が上がる前に走らせる。** playwright.config.ts の
 * webServer の command の先頭で `node --experimental-strip-types e2e/seed.ts` として呼ぶ。
 * `globalSetup` には置かない。Playwright は webServer を globalSetup より先に立ち上げるので、
 * 上がったあとの wrangler dev と同じ SQLite をここで開くことになり、取り合って
 * `database is locked: SQLITE_BUSY` で落ちることがある。
 */
function seed() {
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

// テストは定数を import するだけ。直接起動されたときだけ流す。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	seed();
}

/** 共有中のメモ。`/notes/[id]` で開ける。 */
export const SHARED_NOTE_ID = '01JE2ESHAREDNOTE0000000000';
export const SHARED_RACE_ID = '01JE2ESHAREDRACE0000000000';
export const SUMMARY_RACE_ID = '01JE2ERACESUMMARY000000000';

/** 非公開のメモ。存在するが `/notes/[id]` では 404 になる。 */
export const PRIVATE_NOTE_ID = '01JE2EPRIVATENOTE000000000';

/** タイムラインを見る馬。出走3走のうち、メモが付いているのは1走だけ。 */
export const HORSE_ID = '01JE2EHORSE000000000000000';

/** ふりかえり画面を開くレース。出走1頭（着順まで入っている）。 */
export const REVIEW_RACE_ID = '01JE2ERACEPAST0000000000000';

/**
 * **出走馬が1頭も登録されていない未来のレース。**
 *
 * これから組まれる重賞は、出馬表が出る前に日付と格だけ先に登録される。
 * この状態で書けるのは予想画面の「レースの見立て」だけで、
 * ふりかえりは開けない（予想画面へ戻される）。
 */
export const EMPTY_RACE_ID = '01JE2ERACEEMPTY00000000000';

/**
 * **出走馬が1頭も登録されていない開催済みのレース。**
 *
 * ふりかえりは開けるが、入力欄は「レースのメモ」1つだけ。
 * `EMPTY_RACE_ID` と分けてあるのは、**開催の前後で開ける画面が違う**ため。
 * 1つのレースで両方を見ようとすると、どちらかの日付が嘘になる。
 */
export const PAST_EMPTY_RACE_ID = '01JE2ERACEPASTEMPTY0000000';

/**
 * ダッシュボードのレース欄に出るレース名。**日付は seed を流した日から決まる**
 * （今日 / 10日前 / 40日前）。40日前のものは「直近3週」の窓の外に出る。
 */
export const DASHBOARD_RACES = {
	thisWeek: 'E2E今週賞',
	inWindow: 'E2E先週賞',
	outOfWindow: 'E2E昔賞'
} as const;

/**
 * 今週の重賞の行き先を見る2レース（どちらも今日）。
 * - `upcoming` — 着順が無い。予想画面へ行く（E2E今週賞）
 * - `settled` — 着順が入っている。ふりかえりへ行く（E2E結果確定賞）
 */
export const THIS_WEEK_RACES = {
	upcoming: { id: '01JE2ERACETHISWEEK00000000', name: 'E2E今週賞' },
	settled: { id: '01JE2ERACESETTLED000000000', name: 'E2E結果確定賞' }
} as const;

/** 予想画面を開くレース。出走1頭に、出走前メモが1件だけ付いている。 */
export const PREVIEW_RACE_ID = '01JE2ERACEPREVIEW000000000';

/** 枠の色を見るレース。出走2頭の枠は1枠（白）と8枠（桃）。 */
export const BRACKET_RACE_ID = '01JE2ERACEBRACKET000000000';

/** 予想印の見本のレース。出走6頭に ◎ ○ ▲ △ ☆ × を1つずつ付け、着順も入れてある。 */
export const MARKS_RACE_ID = '01JE2ERACEMARKS00000000000';

/** 展開の予想を保存するレース（右回り・2頭・メモなし）。印見本のレースの見立てには展開の見本が入っている。 */
export const FLOW_RACE_ID = '01JE2ERACEFLOW000000000000';

/** 18頭・枠順前（馬番も枠も無い）。見立てに展開（ハイペース、3局面すべてに18頭）が入っている。 */
export const FLOW_CROWD_RACE_ID = '01JE2ERACEFLOW180000000000';
export const NATIVE_SHARE_RACE_ID = '01JE2ERACENATIVESHARE00000';

/**
 * 未保存の件数と保存の件数がそろうことを見るレース（開催済み。予想もふりかえりも開ける）。
 * 出走2頭で、E2Eカキズミには出走前メモ（○）が保存済み、E2Eコレカラにはまだ何も無い。
 */
export const COUNT_RACE_ID = '01JE2ERACECOUNT0000000000';

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

/**
 * サイト管理者（role='admin'）のセッショントークン。管理画面を開くためだけに使う。
 * `SESSION_TOKEN` と同じく、seed.sql の id はこれの SHA-256。
 */
export const ADMIN_SESSION_TOKEN = 'e2eadminsessiontoken000000000000';

/**
 * 馬タイムライン（`HORSE_ID`）の、メモを書かなかった2走。リンク先を見る。
 * - `quiet` — 着順が入っている（5着）。ふりかえりへ
 * - `future` — 2099年の出走予定。予想画面へ
 */
export const TIMELINE_RUN_RACES = {
	quiet: '01JE2ERACEQUIET000000000000',
	future: '01JE2ERACEFUTURE00000000000'
} as const;

/** 枠の色を見るレースの8枠の馬（E2Eソトワク）。タイムラインに出走前メモ（◎）が1件ある。 */
export const OUTER_HORSE_ID = '01JE2EHORSED00000000000000';

/** 答え合わせで見る、自分の出走前メモの本文（E2E枠色賞のソトワク、印は◎・2着）。 */
export const OUTER_PREVIEW_BODY = '外枠でも先行できれば。';

/** 別のユーザーが同じレースに書いた出走前メモ。**どの画面にも出てはいけない。** */
export const OTHER_USER_PREVIEW_BODY = '他人の見立て。見えてはいけない。';

/** 共有の切り替えを押して確かめる非公開メモ（E2Eウチワクの近況）。テストの最後に非公開へ戻す。 */
export const TOGGLE_SHARE_NOTE_ID = '01JE2ETOGGLESHARENOTE00000';
export const TOGGLE_SHARE_NOTE_BODY = '共有を切り替えて確かめるメモ。';

/**
 * ダッシュボードの「今週出走する注目馬」に出る／出ない馬（どれも E2E今週賞に出走）。
 * - `buy` — 一番新しい結論が次走買い
 * - `drop` — 買い → 消しと書き換えた。**消しで出る**（古い買いを拾っていたら壊れている）
 * - `others` — 別のユーザーが買いを付けた馬。**出てはいけない**
 */
export const WATCH_HORSES = {
	buy: 'E2Eチュウモク',
	drop: 'E2Eミカギリ',
	others: 'E2Eタニンノウマ'
} as const;

/** 10日前のレース（E2E先週賞）。着順が入っていて見立てだけ書いてあり、**ふりかえり待ち**に出る。 */
export const LAST_WEEK_RACE_ID = '01JE2ERACELASTWEEK00000000';

/** 予想画面（E2E予想賞）と同じ条件（京都 芝2200m）の過去のレースに、自分が書いたふりかえり。 */
export const SAME_CONDITION_NOTE_BODY = '内が止まらない馬場だった。外差しは届かない。';

/**
 * 距離だけ違うレース（E2E別距離賞）。出走0頭（着順なし）で、自分のレースのメモが1件ある。
 * **ふりかえりのメモは結果の投入前でもふりかえりへ向ける**ことを見るのにも使う。
 */
export const OTHER_DISTANCE_RACE_ID = '01JE2ERACEOTHERDIST000000';

/** 距離だけ違うレース（京都 芝1800m）に自分が書いたふりかえり。予想画面には出ない。 */
export const OTHER_DISTANCE_NOTE_BODY = '距離が違うので出てはいけない。';

/** 同じ条件のレースに**別のユーザー**が書いたふりかえり。どこにも出てはいけない。 */
export const OTHER_USER_SAME_CONDITION_BODY = '他人のレースメモ。見えてはいけない。';
