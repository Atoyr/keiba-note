import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	// 共有ページのテストが読む行をローカル D1 に入れる。
	// テーブルは `pnpm run db:migrate:local` で先に作っておくこと。
	globalSetup: './e2e/seed.ts',
	testMatch: '**/*.e2e.{ts,js}'
});
