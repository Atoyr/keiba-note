import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { login } from './login';
import { SCREENS, VIEWPORTS, type ViewportName } from './screens';

/**
 * `screens.ts` の画面を全部開いて撮る（docs/harness.md）。
 *
 * 撮るだけでなく、人が見る前に機械で分かることはここで落とす:
 * 開けること・ログイン画面に飛ばされないこと・実行時エラーが出ないこと・
 * mobile で横にはみ出さないこと。
 *
 * 出力先は `SCREENS_OUT`。無ければ `test-results/screens`（CI はこれを artifact に上げる）。
 * `SCREENS_BEFORE` があれば同名の before と見比べ、見た目が同じなら両方消す。
 * どちらも `pnpm run screens <機能名> <before|after>` が渡す。
 */
const OUT = process.env.SCREENS_OUT ?? join('test-results', 'screens');
const BEFORE = process.env.SCREENS_BEFORE;

/**
 * 1画素のどれかのチャンネルがこれより大きくずれたら「変わった」とみなす。
 * 同じコードを2回撮っても、枠線の縁などが 8/255 ほど揺れることがある。
 * 一方で Tailwind の gray-500 → gray-600 程度の色替えでも 30 前後は動くので、間を取る。
 */
const PIXEL_TOLERANCE = 16;

/** 2枚の PNG で、許容幅を超えてずれた画素の数。大きさが違えば Infinity。 */
async function countChangedPixels(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
	const page = await browser.newPage();
	try {
		return await page.evaluate(
			async ([a, b, tolerance]) => {
				const load = async (base64: string) => {
					const img = new Image();
					img.src = `data:image/png;base64,${base64}`;
					await img.decode();
					const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
					ctx.drawImage(img, 0, 0);
					return ctx.getImageData(0, 0, img.width, img.height);
				};
				const [x, y] = await Promise.all([load(a), load(b)]);
				if (x.width !== y.width || x.height !== y.height) return Infinity;
				let changed = 0;
				for (let i = 0; i < x.data.length; i += 4) {
					for (let c = 0; c < 3; c++) {
						if (Math.abs(x.data[i + c] - y.data[i + c]) > tolerance) {
							changed++;
							break;
						}
					}
				}
				return changed;
			},
			[a.toString('base64'), b.toString('base64'), PIXEL_TOLERANCE] as const
		);
	} finally {
		await page.close();
	}
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS) as [
	ViewportName,
	(typeof VIEWPORTS)[ViewportName]
][]) {
	test.describe(viewportName, () => {
		test.use({ viewport });

		for (const screen of SCREENS) {
			test(`画面 ${screen.name} (${viewportName})`, async ({ page, browser }) => {
				const errors: string[] = [];
				page.on('pageerror', (e) => errors.push(e.message));
				page.on('console', (m) => {
					if (m.type() === 'error') errors.push(m.text());
				});

				if (screen.auth) await login(page);
				const res = await page.goto(screen.path);

				expect(res?.status(), `${screen.path} の応答`).toBeLessThan(400);
				await expect(page).not.toHaveURL(/\/login\?/);

				await screen.prepare?.(page);
				// ハイドレーションとフォント待ち。撮った画像が読み込み途中にならないように。
				await page.waitForLoadState('networkidle');
				await page.evaluate(() => document.fonts.ready);

				if (viewportName === 'mobile') {
					const overflow = await page.evaluate(
						() => document.documentElement.scrollWidth - window.innerWidth
					);
					expect(overflow, 'mobile で横にはみ出している（px）').toBeLessThanOrEqual(0);
				}

				const file = `${screen.name}.${viewportName}.png`;
				mkdirSync(OUT, { recursive: true });
				const shot = await page.screenshot({
					path: join(OUT, file),
					fullPage: true,
					animations: 'disabled',
					caret: 'hide'
				});

				expect(errors, '実行時エラー').toEqual([]);

				if (BEFORE && existsSync(join(BEFORE, file))) {
					const changed = await countChangedPixels(browser, readFileSync(join(BEFORE, file)), shot);
					if (changed === 0) {
						rmSync(join(BEFORE, file));
						rmSync(join(OUT, file));
					}
				}
			});
		}
	});
}
