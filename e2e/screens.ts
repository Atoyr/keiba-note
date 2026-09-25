import type { Page } from '@playwright/test';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	HORSE_ID,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	SHARED_NOTE_ID
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
	{ name: 'races', path: '/races', auth: true },
	{ name: 'race-review', path: `/races/${REVIEW_RACE_ID}`, auth: true },
	{ name: 'race-review-bracket', path: `/races/${BRACKET_RACE_ID}`, auth: true },
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
	{ name: 'settings-shares', path: '/settings/shares', auth: true }
];

/** 撮る幅。mobile は iPhone 14 相当。 */
export const VIEWPORTS = {
	desktop: { width: 1280, height: 800 },
	mobile: { width: 390, height: 844 }
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
