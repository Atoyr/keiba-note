import type { Page } from '@playwright/test';
import { waitForHydration } from './hydration';
import { failNextAction } from './action-failure';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	HORSE_ID,
	MARKS_RACE_ID,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	SHARED_NOTE_ID,
	SHARED_RACE_ID
} from './seed';

/**
 * 人がキャプチャで確かめる画面の一覧（docs/testing.md）。
 *
 * `screens.e2e.ts` がここを全部開いて、desktop / mobile の2幅で撮る。
 * 画面を足したり、見せたい状態（開いた・入力した）が増えたりしたら、ここに1行足す。
 * 撮れるのは seed（`seed.sql`）にある行だけなので、足りなければ seed も足す。
 */
export type Screen = {
	/** ファイル名になる。英小文字とハイフンだけ。 */
	name: string;
	path: string;
	/** seed のセッションを載せて開くか。 */
	auth: boolean;
	/** 誰として開くか。既定は一般のユーザー。管理画面は `admin`。 */
	as?: 'user' | 'admin';
	/** 撮る前に画面を目的の状態にする（`<details>` を開く、入力する など）。 */
	prepare?: (page: Page) => Promise<void>;
};

export const SCREENS: Screen[] = [
	{ name: 'landing', path: '/', auth: false },
	{ name: 'login', path: '/login', auth: false },
	{ name: 'privacy', path: '/privacy', auth: false },
	{ name: 'terms', path: '/terms', auth: false },
	{ name: 'dashboard', path: '/', auth: true },
	{
		// 最近のメモはページの末尾にある。一番下のメモの `⋯` を開いて、はみ出さないかを見る。
		name: 'dashboard-note-menu',
		path: '/',
		auth: true,
		prepare: async (page) => {
			await page
				.getByRole('region', { name: '最近のメモ' })
				.locator('li')
				.last()
				.getByTitle('メモの操作')
				.click();
		}
	},
	{ name: 'this-week', path: '/this-week', auth: true },
	// 管理画面。これから2週間のレース（seed では今日の2レース）と、出走馬を取得するボタンが並ぶ。
	// E2E では GitHub のトークンを渡していないので、ボタンは押せない状態で出る。
	{ name: 'admin', path: '/settings/admin', auth: true, as: 'admin' },
	{
		// 取得を断られた状態。結果は押した行の下に出る（トークンが無いので、押せないボタンを外して送る）。
		name: 'admin-fetch-refused',
		path: '/settings/admin',
		auth: true,
		as: 'admin',
		prepare: async (page) => {
			// use:enhance の送信にする（素の送信だと 503 のページへ遷移し、console にエラーが出る）
			await waitForHydration(page);
			const button = page.getByRole('button', { name: /出走馬を取得する$/ }).first();
			await button.evaluate((b) => b.removeAttribute('disabled'));
			await button.click();
			await page.getByRole('alert').waitFor();
		}
	},
	{ name: 'races', path: '/races', auth: true },
	// 既定（今年の重賞）を外した全件。条件戦・先の年のレースも並ぶ。
	{ name: 'races-all', path: '/races?year=', auth: true },
	{ name: 'race-review', path: `/races/${REVIEW_RACE_ID}`, auth: true },
	{ name: 'race-review-bracket', path: `/races/${BRACKET_RACE_ID}`, auth: true },
	// 6つの印を全部並べたところ。印の色を変えたら、ここで背景から浮くか・互いに見分けられるかを見る。
	{ name: 'race-review-marks', path: `/races/${MARKS_RACE_ID}`, auth: true },
	{
		// ふりかえりを書きかけたところ。未保存の件数と保存ボタンが下に貼り付く（書くまでは出ない）。
		name: 'race-review-unsaved',
		path: `/races/${REVIEW_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.locator('textarea[name="raceNoteBody"]').fill('前半緩くて上がり勝負。');
		}
	},
	{
		// 保存したところ。知らせはトーストで下に出て、保存ボタンは消える。
		// **保存は本当には送らない**（seed が書き換わり、ほかの画面の写りが変わる）。
		// action の応答だけを差し替える。data は devalue で `{ saved: 3, savedAt: 0 }`。
		name: 'race-review-saved',
		path: `/races/${REVIEW_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.route(
				(url) => url.pathname === `/races/${REVIEW_RACE_ID}`,
				(route) =>
					route.request().method() === 'POST'
						? route.fulfill({
								contentType: 'application/json',
								body: JSON.stringify({
									type: 'success',
									status: 200,
									data: JSON.stringify([{ saved: 1, savedAt: 2 }, 3, 0])
								})
							})
						: route.fallback()
			);
			await page.locator('textarea[name="raceNoteBody"]').fill('前半緩くて上がり勝負。');
			await page.getByRole('button', { name: 'まとめて保存' }).click();
			await page.locator('[data-sonner-toast]').waitFor();
		}
	},
	{ name: 'race-preview-marks', path: `/races/${MARKS_RACE_ID}/preview`, auth: true },
	{ name: 'race-preview', path: `/races/${PREVIEW_RACE_ID}/preview`, auth: true },
	{
		// スマホではコースを畳んである。開いた状態（広い画面は開いたままなので、そのまま撮る）。
		name: 'race-preview-course-open',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			const summary = page.locator('details summary', { hasText: 'コース' });
			if (await summary.isVisible()) await summary.click();
		}
	},
	{
		// 出走馬がまだいない（印が付けられない）レース。コースだけが全幅で出る。
		name: 'race-preview-no-entries',
		path: `/races/${EMPTY_RACE_ID}/preview`,
		auth: true
	},
	{
		// 開催済みのレース。見出しの下に「ふりかえりを書く」が出る（ふりかえりの見出しと並びをそろえてある）。
		name: 'race-preview-past',
		path: `/races/${PAST_EMPTY_RACE_ID}/preview`,
		auth: true
	},
	{
		name: 'race-preview-editing',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await page.getByText('書き直す', { exact: true }).click();
		}
	},
	{
		// 見立てを書きかけたところ。未保存の件数と保存ボタンが下に貼り付く（書くまでは出ない）。
		name: 'race-preview-unsaved',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.locator('textarea[name="raceNoteBody"]').fill('開幕週で内有利になりそう。');
		}
	},
	{
		// 保存に失敗したところ。文は押した保存ボタンの横に出て、ボタンと件数は残る。
		// 応答だけを差し替える（本当に長すぎる本文を打つと撮るのに時間がかかる）。
		// data は devalue で `{ message: 'メモが長すぎます' }`（schemas/note.ts の文）。
		name: 'race-preview-save-failed',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.route(
				(url) => url.pathname === `/races/${PREVIEW_RACE_ID}/preview`,
				(route) =>
					route.request().method() === 'POST'
						? route.fulfill({
								contentType: 'application/json',
								body: JSON.stringify({
									type: 'failure',
									status: 400,
									data: JSON.stringify([{ message: 1 }, 'メモが長すぎます'])
								})
							})
						: route.fallback()
			);
			await page.locator('textarea[name="raceNoteBody"]').fill('開幕週で内有利になりそう。');
			await page.getByRole('button', { name: '出走前メモを保存' }).click();
			await page.getByRole('alert').waitFor();
		}
	},
	{
		// 印を ☆（穴）に付け替えたところ。保存はしない。選んだ ☆ の色（violet）がほかの印と見分けられるかを見る。
		name: 'race-preview-mark-star',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			const marks = page.getByRole('radiogroup', { name: '予想印' }).first();
			await marks.getByText('☆', { exact: true }).click();
		}
	},
	{
		// 「次走消し」の札（slate-700）と、保存ボタンのテーマカラー（紺）が並んだところ。
		// 色が近いので、見分けがつくかを人が見る（docs/design-system.md 2-4）。
		name: 'race-preview-editing-drop',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await page.getByText('書き直す', { exact: true }).click();
			await page.getByRole('group', { name: 'メモの札' }).getByText('次走消し').click();
		}
	},
	{ name: 'horses', path: '/horses', auth: true },
	{ name: 'horse-timeline', path: `/horses/${HORSE_ID}`, auth: true },
	{
		// 共有と削除は `⋯` に畳んである。共有中の近況メモのメニューを開いた状態。
		name: 'horse-timeline-note-menu',
		path: `/horses/${HORSE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page
				.locator('main ol > li', { hasText: '直線で外に出してから一完歩が速い。' })
				.getByTitle('メモの操作')
				.click();
		}
	},
	{ name: 'share-page', path: `/notes/${SHARED_NOTE_ID}`, auth: false },
	{ name: 'settings-profile', path: '/settings/profile', auth: true },
	{
		name: 'settings-profile-save-failed',
		path: '/settings/profile',
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.getByLabel('公開用の名前', { exact: true }).fill('週末うまメモ');
			await failNextAction(page, '/settings/profile', {
				publicName: '週末うまメモ',
				message: '公開用の名前の保存を確認できませんでした。時間をおいてもう一度保存してください。'
			});
			await page.getByRole('button', { name: '公開用の名前を保存', exact: true }).click();
			await page.getByRole('alert').waitFor();
		}
	},
	{
		name: 'race-summary-share-failed',
		path: `/races/${PREVIEW_RACE_ID}/summary`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await failNextAction(page, `/races/${PREVIEW_RACE_ID}/summary`, {
				failed: true,
				message: '共有内容の保存を確認できませんでした。時間をおいてもう一度お試しください。'
			});
			await page.getByRole('button', { name: '共有リンクを作る' }).click();
			await page.getByRole('alert').waitFor();
		}
	},
	{
		name: 'race-summary-revoke-failed',
		path: `/races/${MARKS_RACE_ID}/summary`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await failNextAction(page, `/races/${MARKS_RACE_ID}/summary`, {
				failed: true,
				message:
					'共有の解除を確認できませんでした。時間をおいてもう一度「共有をやめる」を押してください。'
			});
			await page.getByRole('button', { name: '共有をやめる', exact: true }).click();
			await page.getByRole('alert').waitFor();
		}
	},
	{
		name: 'settings-profile-editing',
		path: '/settings/profile',
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page.getByLabel('公開用の名前', { exact: true }).fill('週末うまメモ');
		}
	},
	{ name: 'race-summary', path: `/races/${PREVIEW_RACE_ID}/summary`, auth: true },
	// 全印と、印を付けず本文だけ保存した馬を同じまとめに表示する。
	{ name: 'race-summary-marks', path: `/races/${MARKS_RACE_ID}/summary`, auth: true },
	{ name: 'race-summary-empty', path: `/races/${EMPTY_RACE_ID}/summary`, auth: true },
	{ name: 'race-summary-shared', path: `/shared/races/${SHARED_RACE_ID}`, auth: false },
	{ name: 'settings-shares', path: '/settings/shares', auth: true }
];

/** 撮る幅。mobile は iPhone 14 相当。 */
export const VIEWPORTS = {
	desktop: { width: 1280, height: 800 },
	mobile: { width: 390, height: 844 }
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
