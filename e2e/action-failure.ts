import type { Page } from '@playwright/test';

/** 次のform actionだけを失敗させる。seedや本物のDBを壊さず、入力保持と再試行を確かめる。 */
export async function failNextAction(
	page: Page,
	path: string,
	data: Record<string, string | boolean>
) {
	const entries = Object.entries(data);
	await page.route(
		(url) => url.pathname === path,
		(route) =>
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({
					type: 'failure',
					status: 503,
					data: JSON.stringify([
						Object.fromEntries(entries.map(([key], i) => [key, i + 1])),
						...entries.map(([, value]) => value)
					])
				})
			}),
		{ times: 1 }
	);
}
