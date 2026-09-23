import { expect, type Page } from '@playwright/test';

/**
 * hydration が済むまで待つ。**入力欄に書く前に必ず呼ぶ。**
 *
 * `page.goto` / `page.reload` が待つのは load イベントまでで、SvelteKit の hydration は
 * そのあと非同期に走る。済む前に `fill` すると、hydration が SSR の値（多くは空）で
 * 上書きし、そのまま保存すると「空欄＝消す」で保存される。並列で JS の配信が遅れたときだけ
 * 起きるので、単体のファイルだけ回すと通ってしまう。
 *
 * 印はルートレイアウトの onMount が `<html data-hydrated>` に立てる。
 * クライアント側の遷移では document が替わらないので印は残る（hydration も起きない）。
 */
export async function waitForHydration(page: Page) {
	await expect(page.locator('html')).toHaveAttribute('data-hydrated');
}

/** `page.goto` のあと hydration まで待つ。開いてすぐ書くテストはこちらで開く。 */
export async function gotoHydrated(page: Page, path: string) {
	await page.goto(path);
	await waitForHydration(page);
}
