import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	driver: 'd1-http',
	// マイグレーション SQL の生成のみ drizzle-kit で行い、適用は
	// `wrangler d1 migrations apply` に任せる（drizzle-kit push は使わない）。
	verbose: true,
	strict: true
});
