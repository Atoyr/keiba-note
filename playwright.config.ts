import { defineConfig } from '@playwright/test';
import { webServerTimeout } from './e2e/seed';

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
	// サーバーの定義は scripts/preview-e2e.ts。
	webServer: {
		command: 'node --experimental-strip-types scripts/preview-e2e.ts',
		port: PORT,
		// seed が JST の 0 時をまたがないよう待つことがある（e2e/seed.ts）。その日は起動待ちを伸ばす。
		timeout: webServerTimeout(new Date())
	},
	testMatch: '**/*.e2e.{ts,js}',
	// 手元の既定の list はテスト1件ごとに1行出し、431行がそのまま会話のログに入る。
	// dot なら1件1文字で済む。失敗したテストの詳細は最後に出る。CI の既定も dot。
	reporter: 'dot',
	// CI のランナーは 4 vCPU で、既定（コア数の半分）だと 2 になる。4 に増やして使い切る。
	// サーバー（wrangler dev）は1つなので、増やしすぎるとテストよりそちらが詰まる。手元は既定のまま。
	workers: process.env.CI ? 4 : undefined
});
