import { expect, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';

/**
 * レース画面の見出し右端の `⋯` を押してメニューを開く。
 *
 * 他の画面への導線（予想をまとめて見る・重賞のタイムライン・ふりかえりを書く・出走馬を編集）は
 * ここに畳んである。メニューは JS で開くので、hydration を待ってから押す。
 */
export async function openRaceMenu(page: Page) {
	await waitForHydration(page);
	await page.getByRole('button', { name: 'レースのメニュー' }).click();
	await expect(page.getByRole('menu')).toBeVisible();
}

/** メニューを開いて、項目（リンク）を返す。押すかどうかは呼び出し側が決める。 */
export async function raceMenuItem(page: Page, name: string): Promise<Locator> {
	await openRaceMenu(page);
	return page.getByRole('menuitem', { name });
}
