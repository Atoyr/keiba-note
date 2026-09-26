import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from '../hydration';

/**
 * 紹介ページ（src/lib/components/LandingPage.svelte）に載せるキャプチャを撮る。
 *
 *   pnpm run landing:shots
 *
 * 見本データ（e2e/landing/seed.sql）の入った D1 で本番ビルドを開き、スマホの幅で撮って
 * `src/lib/assets/landing/<名前>.png` に書く。**これはコミットする**（紹介ページがそのまま読む）。
 * PR に貼るキャプチャ（`pnpm run screens`）とは別物で、あちらはコミットしない。
 *
 * 画面の見た目を変えたら撮り直す。seed の日付は流した日から決まるので、撮るたびに日付が変わる。
 */

const OUT = join('src', 'lib', 'assets', 'landing');

/** 画像の大きさ（CSS px）。紹介ページが `<img>` の width / height に使う。 */
const SIZES = join(OUT, 'sizes.json');

/** 2倍で撮る。紹介ページでは 390px 前後の幅で出すので、高密度の画面でも文字がにじまない。 */
const DEVICE_SCALE = 2;

/** seed.sql の session の id は、この文字列の SHA-256。 */
const LANDING_SESSION_TOKEN = 'landingsessiontoken0000000000000';

const TODAY_RACE_ID = '01JLPRACETODAY000000000000';
const REVIEW_RACE_ID = '01JLPRACEREVIEW00000000000';
const HORSE_ID = '01JLPHORSE0000000000000001';

/** スマホ1画面ぶんの高さ（CSS px）。ヘッダから撮るものはここまでで切る。 */
const SCREEN_HEIGHT = 720;

type Shot = {
	/** ファイル名（`<name>.png`）。LandingPage.svelte が import する名前。 */
	name: string;
	path: string;
	/** 撮る前に画面を目的の状態にする。 */
	prepare?: (page: Page) => Promise<void>;
	/**
	 * どこを撮るか。省けばページの先頭（ヘッダ込み）からスマホ1画面ぶん。
	 * 返した要素があれば、その要素の枠で切る。
	 */
	target?: (page: Page) => Locator;
};

const SHOTS: Shot[] = [
	// ダッシュボード: 今週の注目馬・ふりかえり待ち・今週のレース。
	{ name: 'dashboard', path: '/' },
	// 予想画面の先頭: 付けた印・コース・レースの見立て。
	{
		name: 'preview',
		path: `/races/${TODAY_RACE_ID}/preview`,
		prepare: async (page) => {
			// スマホではコースを畳んである。紹介では開いて見せる。
			await page.locator('details summary', { hasText: 'コース' }).click();
		}
	},
	// 予想画面の出走馬: 印・オッズ・馬柱・前回の札・過去のメモ。◎の1頭を撮る。
	{
		name: 'preview-entry',
		path: `/races/${TODAY_RACE_ID}/preview`,
		target: (page) => page.locator('#entry-01JLPENTRYTODAY00000000001')
	},
	// 展開の予想: 4コーナーの盤面を開いたところ。
	{
		name: 'flow',
		path: `/races/${TODAY_RACE_ID}/preview`,
		prepare: async (page) => {
			await waitForHydration(page);
			const flow = page.locator('details', { hasText: '展開の予想' });
			await flow.locator('summary').click();
			await flow.getByRole('tab', { name: /4コーナー/ }).click();
		},
		target: (page) => page.locator('details', { hasText: '展開の予想' })
	},
	// ふりかえり: 答え合わせとレースのメモ。
	{ name: 'review', path: `/races/${REVIEW_RACE_ID}` },
	// 馬のタイムライン。
	{ name: 'horse', path: `/horses/${HORSE_ID}` },
	// 予想まとめ（共有の元になる画面）。
	{ name: 'summary', path: `/races/${TODAY_RACE_ID}/summary` }
];

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DEVICE_SCALE });

for (const shot of SHOTS) {
	test(`紹介ページのキャプチャ ${shot.name}`, async ({ page }) => {
		await page.context().addCookies([
			{
				name: 'session',
				value: LANDING_SESSION_TOKEN,
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);
		const res = await page.goto(shot.path);
		expect(res?.status(), `${shot.path} の応答`).toBeLessThan(400);
		await expect(page).not.toHaveURL(/\/login/);

		await shot.prepare?.(page);
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);

		mkdirSync(OUT, { recursive: true });
		const options = {
			path: join(OUT, `${shot.name}.png`),
			animations: 'disabled',
			caret: 'hide'
		} as const;

		const png = shot.target
			? await shot.target(page).screenshot(options)
			: await page.screenshot({
					...options,
					clip: { x: 0, y: 0, width: 390, height: SCREEN_HEIGHT }
				});

		// 紹介ページの <img> に width / height を入れるため、CSS px の大きさを書き残す
		// （画像が読み込まれる前から枠の高さが決まり、読み込みで下の文がずれない）。
		// 1枚だけ撮り直すこともあるので、ほかの画像の行は残して書き足す。
		const sizes: Record<string, { width: number; height: number }> = existsSync(SIZES)
			? JSON.parse(readFileSync(SIZES, 'utf8'))
			: {};
		// PNG の IHDR。幅と高さは 16・20 バイト目からの 4 バイト（big endian）。
		sizes[shot.name] = {
			width: Math.round(png.readUInt32BE(16) / DEVICE_SCALE),
			height: Math.round(png.readUInt32BE(20) / DEVICE_SCALE)
		};
		const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
		writeFileSync(SIZES, `${JSON.stringify(sorted, null, '\t')}\n`);
	});
}
