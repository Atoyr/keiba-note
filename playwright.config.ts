import { defineConfig } from '@playwright/test';
import { E2E_STATE } from './e2e/seed';

export default defineConfig({
	// 本番ビルドで走らせる（CSRF 検証が効くのはここだけ）。D1 は開発用と分けた E2E 専用のもの。
	webServer: {
		command: `npm run build && pnpm exec wrangler dev .svelte-kit/cloudflare/_worker.js --port 4173 --persist-to ${E2E_STATE}`,
		port: 4173
	},
	// E2E 専用 D1 をマイグレーションし、空にしてから e2e/seed.sql を流す。
	globalSetup: './e2e/seed.ts',
	testMatch: '**/*.e2e.{ts,js}'
});
