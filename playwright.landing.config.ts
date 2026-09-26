import { defineConfig } from '@playwright/test';
import { LANDING_STATE } from './e2e/seed';

/**
 * 紹介ページ（未ログインの `/`）に載せるキャプチャを撮る設定（`pnpm run landing:shots`）。
 *
 * E2E（playwright.config.ts）と同じく本番ビルドを wrangler dev で動かすが、D1 は別（.wrangler/landing）で、
 * 流すのは見本データ（e2e/landing/seed.sql）。テストではないので `pnpm test` には入らない。
 * ポートも E2E と分ける（E2E と同時に回しても相手のサーバーに当たらないように）。
 */
const PORT = Number(process.env.LANDING_PORT ?? 4183);

export default defineConfig({
	webServer: {
		command: `node --experimental-strip-types e2e/seed.ts landing && npm run build && pnpm exec wrangler dev --port ${PORT} --persist-to ${LANDING_STATE} --var DISCORD_WEBHOOK_URL: --var GITHUB_DISPATCH_TOKEN:`,
		port: PORT
	},
	use: { baseURL: `http://localhost:${PORT}` },
	testDir: 'e2e/landing',
	testMatch: 'shoot.ts',
	// 撮るだけなので1回で十分。並べると同じ D1 を読む撮影どうしで待ちが出るだけ。
	workers: 1
});
