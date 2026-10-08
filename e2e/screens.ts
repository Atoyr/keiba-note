import { expect, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';
import { failNextAction } from './action-failure';
import { mockDeviceShare } from './native-share';
import { applyPrediction, mockPredictionTools } from './webmcp';
import {
	ACTUAL_FLOW_18_RACE_ID,
	ACTUAL_FLOW_RACE_ID,
	BRACKET_RACE_ID,
	COUNT_RACE_ID,
	EMPTY_RACE_ID,
	FLOW_CROWD_RACE_ID,
	FLOW_RACE_ID,
	GRADED_RACE,
	FILLY_HORSE_ID,
	HORSE_ID,
	JOCKEYS,
	MARKS_RACE_ID,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	SPRINT_RACE_ID,
	TOKYO_DIRT_RACE_ID,
	TOKYO_MILE_RACE_ID,
	SHARED_NOTE_ID,
	SHARED_MANY_MARKS_ID,
	SHARED_OUTLOOK_ID,
	SHARED_RACE_ID,
	MCP_CLIENT,
	MCP_METADATA_CLIENT,
	TOGGLE_FAVORITE_HORSE_ID
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
	/**
	 * 末尾までスクロールせずに撮る。100件ずつ読む一覧（`LoadMore`）は下端に近づくと続きを読むので、
	 * スクロールすると撮っている間に行が増え、撮るたびに違う画像になる。
	 */
	stayAtTop?: boolean;
};

/** 下端で続きを読む一覧の「続きを読み込む」。 */
const loadMore = (page: Page) => page.getByRole('link', { name: '続きを読み込む' });

export const SCREENS: Screen[] = [
	{ name: 'webmcp-guide', path: '/help/webmcp', auth: true },
	// MCP（Claude・ChatGPT のプラグイン）の登録の案内。
	{ name: 'mcp-guide', path: '/help/mcp', auth: true },
	{
		name: 'webmcp-guide-supported',
		path: '/help/webmcp',
		auth: true,
		prepare: async (page) => {
			await mockPredictionTools(page);
			await page.reload();
			await waitForHydration(page);
			await expect(
				page.getByText('このブラウザには、uma-memoが使うWebMCPの対応APIがあります。')
			).toBeVisible();
		}
	},
	{
		// 紹介ページのキャプチャは loading="lazy" なので、下まで送って全部の読み込みを待つ
		// （待たないと、画面の外にあった画像が空の枠のまま写る）。
		name: 'landing',
		path: '/',
		auth: false,
		prepare: async (page) => {
			for (const img of await page.locator('main img').all()) {
				await img.scrollIntoViewIfNeeded();
				await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete)).toBe(true);
			}
		}
	},
	{ name: 'login', path: '/login', auth: false },
	{ name: 'privacy', path: '/privacy', auth: false },
	{ name: 'terms', path: '/terms', auth: false },
	{ name: 'dashboard', path: '/', auth: true },
	// 推しがまだいないとき（seed の admin には推しもメモも無い）。推しの出走予定の枠に案内が出る。
	{ name: 'dashboard-no-favorites', path: '/', auth: true, as: 'admin' },
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
	{ name: 'races', path: '/races', auth: true, stayAtTop: true },
	// 既定（今年の重賞）を外した全件。条件戦・先の年のレースも並ぶ。
	// 100件を超えるので、下端に「続きを読み込む」が出る。
	{ name: 'races-all', path: '/races?year=', auth: true, stayAtTop: true },
	{ name: 'race-review', path: `/races/${REVIEW_RACE_ID}`, auth: true },
	{ name: 'race-review-bracket', path: `/races/${BRACKET_RACE_ID}`, auth: true },
	// 6つの印を全部並べたところ。印の色を変えたら、ここで背景から浮くか・互いに見分けられるかを見る。
	{ name: 'race-review-marks', path: `/races/${MARKS_RACE_ID}`, auth: true },
	// 展開の予想を置いていないレース。実際の展開（4角・ゴール前）だけが出る。
	{ name: 'race-review-actual-flow', path: `/races/${ACTUAL_FLOW_RACE_ID}`, auth: true },
	// 18頭立て。盤面の1マスに順位2つぶんをまとめる。
	{ name: 'race-review-actual-flow-18', path: `/races/${ACTUAL_FLOW_18_RACE_ID}`, auth: true },
	{
		// 実際の展開を開いたところ（4段の盤面に、1マス2頭ずつ積む）。
		name: 'race-review-actual-flow-18-open',
		path: `/races/${ACTUAL_FLOW_18_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: '実際の展開' }).click();
		}
	},
	{
		// 実際の展開が出ない（出走馬がそろっていない）レースでラップを開いたところ。
		name: 'race-review-laps-open-no-flow',
		path: `/races/${BRACKET_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: 'ラップ' }).click();
		}
	},
	{
		// ラップを開いたところ（前半3F・後半3Fを塗った折れ線と区間タイム）。
		name: 'race-review-laps-open',
		path: `/races/${MARKS_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: 'ラップ' }).click();
		}
	},
	{
		// 予想ありのレースで実際の展開を開いたところ（盤面の下に予想の隊列）。
		name: 'race-review-actual-flow-marks-open',
		path: `/races/${MARKS_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: '実際の展開' }).click();
		}
	},
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
		// action の応答だけを差し替える。data は devalue で `{ savedAt: 0 }`。
		// 知らせの件数は応答ではなく画面の側で数える（変えたのはレースのメモ1つ＝1 件）。
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
									data: JSON.stringify([{ savedAt: 1 }, 0])
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
	{
		// 人気順に並べ替えたところ（同じ2人気は馬番の順、取消で人気の無い馬は最後）。
		name: 'race-preview-popularity',
		path: `/races/${MARKS_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await page
				.getByRole('group', { name: '並び順' })
				.getByRole('button', { name: '人気順' })
				.click();
		}
	},
	{
		// 展開の予想を開き、4コーナーの盤面で置いた馬を1頭選んだところ（入れ替え・外すの操作が出る）。
		name: 'race-preview-flow',
		path: `/races/${MARKS_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			const flow = page.locator('details', { hasText: '展開の予想' });
			await flow.locator('summary').click();
			await flow.getByRole('tab', { name: /4コーナー/ }).click();
			await flow.getByRole('button', { name: /^2番 E2Eタイコウ（/ }).click();
		}
	},
	// 18頭・枠順前。畳んだ行が折り返して収まるか（馬番が無いので頭2文字が並ぶ）。
	{ name: 'race-preview-flow-crowd', path: `/races/${FLOW_CROWD_RACE_ID}/preview`, auth: true },
	{
		// 同じレースで4コーナーを開いたところ。枠の色が無い灰色のコマに頭2文字。
		name: 'race-preview-flow-crowd-open',
		path: `/races/${FLOW_CROWD_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			const flow = page.locator('details', { hasText: '展開の予想' });
			await flow.locator('summary').click();
			await flow.getByRole('tab', { name: /4コーナー/ }).click();
		}
	},
	{
		// 予想まとめで展開を開いたところ（既定は畳む）。
		name: 'race-summary-flow-open',
		path: `/races/${MARKS_RACE_ID}/summary`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: '展開の予想' }).click();
		}
	},
	{
		// 出走馬を置く前。全頭が「まだ置いていない馬」に並ぶ。
		name: 'race-preview-flow-empty',
		path: `/races/${FLOW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: '展開の予想' }).click();
		}
	},
	{
		// ふりかえりの「開催前の見立て」で、展開の予想を開いたところ。
		name: 'race-review-flow-open',
		path: `/races/${MARKS_RACE_ID}`,
		auth: true,
		prepare: async (page) => {
			await page.locator('details summary', { hasText: '展開の予想' }).click();
		}
	},
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
		// 中山の芝1200m。外回りの形（2コーナーから外へ分かれる）と、下って最後に上る高低断面。
		name: 'race-preview-course-sprint',
		path: `/races/${SPRINT_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			const summary = page.locator('details summary', { hasText: 'コース' });
			if (await summary.isVisible()) await summary.click();
		}
	},
	{
		// 東京の芝1600m。向正面を延ばした引き込み線から出て、ゴールまで走る線。
		name: 'race-preview-course-tokyo-mile',
		path: `/races/${TOKYO_MILE_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			const summary = page.locator('details summary', { hasText: 'コース' });
			if (await summary.isVisible()) await summary.click();
		}
	},
	{
		// 東京のダート1600m。芝の内側に沿うダートの帯と、ダートの上の道すじ。
		name: 'race-preview-course-tokyo-dirt',
		path: `/races/${TOKYO_DIRT_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			const summary = page.locator('details summary', { hasText: 'コース' });
			if (await summary.isVisible()) await summary.click();
		}
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
		name: 'race-preview-ai-draft',
		path: `/races/${PREVIEW_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await mockPredictionTools(page);
			await page.reload();
			await waitForHydration(page);
			await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(2);
			const entryId = await page.locator('textarea[name^="body."]').getAttribute('name');
			await page.getByText('書き直す', { exact: true }).click();
			await applyPrediction(page, {
				race: { body: '前半から流れそう。差し中心。', pace: 'ハイ' },
				entries: [
					{
						entryId: entryId!.slice(5),
						mark: '◎',
						body: '前走不利。展開が向きそう。',
						tags: ['不利']
					}
				]
			});
			await expect(
				page.locator('[data-sonner-toaster][data-y-position="top"] [data-sonner-toast]')
			).toBeVisible();
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
		// 1頭に本文・札・印を付けたところ。欄は3つでも、未保存はメモ1つ＝「1 件」と数える。
		name: 'race-preview-unsaved-entry',
		path: `/races/${COUNT_RACE_ID}/preview`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			const row = page.locator('li[id^="entry-"]', { hasText: 'E2Eコレカラ' });
			await row.getByText('＋ 出走前メモ').click();
			await row.locator('textarea').fill('距離短縮で前に行けそう。');
			await row.getByText('次走買い', { exact: true }).click();
			await row.getByText('▲', { exact: true }).click();
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
	{ name: 'horses', path: '/horses', auth: true, stayAtTop: true },
	// 続きを読み込んだあと。2ページ目の馬が足され、下端のボタンは消える。
	{
		name: 'horses-loaded',
		path: '/horses',
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await loadMore(page).click();
			await expect(loadMore(page)).toHaveCount(0);
		}
	},
	// 推しの馬。名前の右に黄色く塗った★（押すと推しから外す）。
	{ name: 'horse-timeline', path: `/horses/${HORSE_ID}`, auth: true },
	// 牝馬・栗東。札の色がピンクと橙。
	{ name: 'horse-profile-filly', path: `/horses/${FILLY_HORSE_ID}`, auth: true },
	// 推しでない馬。黄色の輪郭だけの☆（押すと推しにする）。
	{ name: 'horse-not-favorite', path: `/horses/${TOGGLE_FAVORITE_HORSE_ID}`, auth: true },
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
	// 騎手の一覧。騎乗の多い順に、自分が付けた札と一緒に並ぶ。上に「札で絞る」。
	{ name: 'jockeys', path: '/jockeys', auth: true },
	// 札で絞ったところ（選んだ札に ✓）。
	{ name: 'jockeys-tag', path: `/jockeys?tag=${encodeURIComponent('中山巧者')}`, auth: true },
	// 騎手の画面。まとめ（本文と札）と、騎乗ごとの自分のメモ。
	{ name: 'jockey-timeline', path: `/jockeys/${encodeURIComponent(JOCKEYS.main)}`, auth: true },
	// メモのある騎乗だけに絞ったところ。
	{
		name: 'jockey-timeline-noted',
		path: `/jockeys/${encodeURIComponent(JOCKEYS.main)}?notes=1`,
		auth: true
	},
	{
		// まとめを書き直しているところ。札は系統ごとに段になって並ぶ。
		name: 'jockey-summary-editing',
		path: `/jockeys/${encodeURIComponent(JOCKEYS.main)}`,
		auth: true,
		prepare: async (page) => {
			await page.getByText('書き直す', { exact: true }).click();
		}
	},
	// まとめがまだ無い騎手（1騎乗だけ）。
	{ name: 'jockey-no-summary', path: `/jockeys/${encodeURIComponent(JOCKEYS.rookie)}`, auth: true },
	// 重賞の一覧。今年の重賞が月ごとに並び、メモのある年の数と「傾向」の札が右に出る。
	{ name: 'graded-races', path: '/graded-races', auth: true },
	// 重賞の画面。傾向のメモと、年ごとの予想・ふりかえり・印（今年は開催予定、去年は別名のレース名、一昨年はメモなし）。
	{ name: 'graded-race', path: `/graded-races/${encodeURIComponent(GRADED_RACE.key)}`, auth: true },
	{
		// 傾向を書いているところ。
		name: 'graded-race-trend-editing',
		path: `/graded-races/${encodeURIComponent(GRADED_RACE.key)}`,
		auth: true,
		prepare: async (page) => {
			await page.getByText('＋ 傾向を書く').click();
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
	...(['copy', 'manual', 'retry', 'pending'] as const).map((mode): Screen => ({
		name: `race-summary-share-${mode}`,
		path: `/races/${MARKS_RACE_ID}/summary`,
		auth: true,
		prepare: async (page) => {
			await waitForHydration(page);
			await mockDeviceShare(page, mode);
			// 既存コピーで成功応答を再現し、他のキャプチャ用の共有内容を更新しない。
			await page.route(
				(url) => url.pathname === `/races/${MARKS_RACE_ID}/summary`,
				(route) =>
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify({
							type: 'success',
							status: 200,
							data: JSON.stringify([
								{ shareId: 1, message: 2 },
								SHARED_RACE_ID,
								'共有内容を保存しました。下のリンクを共有できます。'
							])
						})
					}),
				{ times: 1 }
			);
			await page.getByRole('button', { name: '予想をシェア', exact: true }).click();
			if (mode === 'pending') {
				await page.getByRole('button', { name: '共有リンクを準備中', exact: true }).waitFor();
				return;
			}
			await page
				.getByText(
					mode === 'copy'
						? '共有リンクをコピーしました。投稿先に貼り付けてください。'
						: mode === 'manual'
							? '共有リンクを用意しました。「リンクをコピー」かリンク欄の選択でコピーしてください。'
							: '共有リンクを用意しました。投稿先の選択を開けなかったため、「投稿先を選ぶ」を押すか、リンクをコピーしてください。'
				)
				.waitFor();
		}
	})),
	// 全印と、印を付けず本文だけ保存した馬を同じまとめに表示する。
	{ name: 'race-summary-marks', path: `/races/${MARKS_RACE_ID}/summary`, auth: true },
	{ name: 'race-summary-empty', path: `/races/${EMPTY_RACE_ID}/summary`, auth: true },
	// 未ログインなら一番下に紹介ページとログインへの案内が出る。ログイン中は出ない。
	{ name: 'race-summary-shared', path: `/shared/races/${SHARED_RACE_ID}`, auth: false },
	{ name: 'race-summary-shared-signed-in', path: `/shared/races/${SHARED_RACE_ID}`, auth: true },
	// 共有リンクを SNS に貼ったときの画像（og:image）。画像そのものを開いて撮る。
	{ name: 'race-summary-shared-og', path: `/shared/races/${SHARED_RACE_ID}/og.png`, auth: false },
	{
		name: 'race-summary-shared-og-many',
		path: `/shared/races/${SHARED_MANY_MARKS_ID}/og.png`,
		auth: false
	},
	{
		name: 'race-summary-shared-og-outlook',
		path: `/shared/races/${SHARED_OUTLOOK_ID}/og.png`,
		auth: false
	},
	{ name: 'settings-shares', path: '/settings/shares', auth: true },
	// AI との連携（MCP）。seed に自分の連携が2つ（全部を許したもの・レースだけのもの）ある。
	{ name: 'settings-connections', path: '/settings/connections', auth: true },
	// 上限に達した状態。seed の管理者に、読み取り 100%・書き込み 30% の今週の行を置いてある。
	{ name: 'settings-connections-limit', path: '/settings/connections', auth: true, as: 'admin' },
	// 同意画面。seed のクライアントと登録どおりの戻り先で開く（許可は押さない）。
	{
		name: 'oauth-authorize',
		path: `/oauth/authorize?${new URLSearchParams({
			response_type: 'code',
			client_id: MCP_CLIENT.id,
			redirect_uri: MCP_CLIENT.redirectUri,
			code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			code_challenge_method: 'S256',
			state: 'screens'
		})}`,
		auth: true
	},
	// 登録と違う戻り先。戻り先へ飛ばさず、この画面で止める。
	{
		name: 'oauth-authorize-invalid',
		path: `/oauth/authorize?${new URLSearchParams({
			client_id: MCP_CLIENT.id,
			redirect_uri: 'https://evil.example/cb'
		})}`,
		auth: true
	},
	// Client ID Metadata Document のクライアントの同意画面。名前の下に「提供元」が出る。
	{
		name: 'oauth-authorize-metadata',
		path: `/oauth/authorize?${new URLSearchParams({
			response_type: 'code',
			client_id: MCP_METADATA_CLIENT.id,
			redirect_uri: MCP_METADATA_CLIENT.redirectUri,
			code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
			code_challenge_method: 'S256',
			state: 'screens'
		})}`,
		auth: true
	}
];

/** 撮る幅。mobile は iPhone 14 相当。 */
export const VIEWPORTS = {
	desktop: { width: 1280, height: 800 },
	mobile: { width: 390, height: 844 }
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
