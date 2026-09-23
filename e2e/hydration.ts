import { expect, type Page } from '@playwright/test';

/**
 * hydration が済むまで待つ。**入力欄に書く前に必ず呼ぶ。**
 *
 * `page.goto` / `page.reload` が待つのは load イベントまでで、SvelteKit の hydration は
 * そのあと非同期に走る。済む前に書いた値は hydration のあとに書き戻される
 * （src/lib/utils/early-input.ts）が、済む前に送信すると `use:enhance` の無い送信になり、
 * `DraftKeeper` もまだ動いていない。並列で JS の配信が遅れたときだけ違う経路を通るので、
 * 待って揃える。
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
