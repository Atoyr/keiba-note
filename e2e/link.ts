import { expect, type Locator } from '@playwright/test';

/**
 * リンクの行き先を、解決後の URL（`a.href` プロパティ）で確かめる。
 * href 属性は hydration の前後で相対パスから絶対パスに変わるので、こちらで見る（docs/testing.md 第2章）。
 * プロパティは前でも後でも同じ値なので、hydration を待たずに見られる。
 */
export async function expectLinkTo(link: Locator, path: string) {
	await expect(link).toHaveJSProperty('href', new URL(path, link.page().url()).href);
}
