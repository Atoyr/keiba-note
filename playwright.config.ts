import { defineConfig } from '@playwright/test';
import { E2E_STATE } from './e2e/seed';

/**
 * プレビューサーバーのポート。既定は 4173。
 *
 * 同じマシンで別の worktree も E2E を回していると、同じポートを取り合って
 * **相手のサーバー（相手の D1）に当たる**ことがある。前の実行の途中の行が見えたり、
 * 途中でつながらなくなったりして、テストとは関係なく落ちる。並べて回すときは
 * worktree ごとに `E2E_PORT` を変える。
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
	// 本番ビルドで走らせる（CSRF 検証が効くのはここだけ）。D1 は開発用と分けた E2E 専用のもの。
	// wrangler dev は .dev.vars を読むので、手元に Discord の Webhook を置いていても
	// E2E から通知が飛ばないよう空で上書きする（--var が .dev.vars より勝つ）。
	// GitHub のトークンも同じ。手元に置いていても、E2E から Actions を起動しない。
	webServer: {
		command: `npm run build && pnpm exec wrangler dev --port ${PORT} --persist-to ${E2E_STATE} --var DISCORD_WEBHOOK_URL: --var GITHUB_DISPATCH_TOKEN:`,
		port: PORT
	},
	// E2E 専用 D1 をマイグレーションし、空にしてから e2e/seed.sql を流す。
	globalSetup: './e2e/seed.ts',
	testMatch: '**/*.e2e.{ts,js}'
});
