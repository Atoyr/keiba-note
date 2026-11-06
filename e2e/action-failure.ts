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

/**
 * 次のページの action への POST に、成功の応答を返す。DB を変えずに「保存が通った」画面を確かめる・撮るときに使う。
 * POST 以外（ページの読み込みなど）は通す。`times` を省くと、ページを閉じるまで返し続ける。
 */
export async function succeedAction(
	page: Page,
	path: string,
	data: Record<string, string | boolean> = {},
	times?: number
) {
	const entries = Object.entries(data);
	await page.route(
		(url) => url.pathname === path,
		(route) =>
			route.request().method() !== 'POST'
				? route.fallback()
				: route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify({
							type: 'success',
							status: 200,
							data: JSON.stringify([
								Object.fromEntries(entries.map(([key], i) => [key, i + 1])),
								...entries.map(([, value]) => value)
							])
						})
					}),
		times ? { times } : undefined
	);
}
