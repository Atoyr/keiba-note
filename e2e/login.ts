import type { Page } from '@playwright/test';
import { SESSION_TOKEN } from './seed';

/**
 * seed で用意したセッションを Cookie に載せる。
 *
 * E2E は本番ビルド（`npm run build && npm run preview`）で走り、
 * モック認証は `dev` ガードで消えている。ログインが要る画面を見るには
 * ここを通るしかない。
 */
export async function login(page: Page) {
	await page.context().addCookies([
		{
			name: 'session',
			value: SESSION_TOKEN,
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
}
