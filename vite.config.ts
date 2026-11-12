import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// 書き出し先は wrangler.toml ではなく wrangler.adapter.toml から読ませる（src/worker.js）
			// `vite dev` / preview の env（`cloudflare:workers`）はバインディングを持つ wrangler.toml から作る。
			// 既定だと adapter の config（wrangler.adapter.toml）を読み、D1 が無い env になる。
			adapter: adapter({
				config: 'wrangler.adapter.toml',
				platformProxy: { configPath: 'wrangler.toml' }
			})
		})
	],
	// @lucide/svelte は生の .svelte を配布しているため、SSR 時に Node が
	// 直接読み込もうとして落ちる。バンドル対象に含めて解決させる。
	ssr: { noExternal: ['@lucide/svelte'] },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// `cloudflare:workers` は workerd の中にしか無い。単体テストでは小さな差し替えに向ける
					// （import してよい場所は architecture.md 3-1。testing.md）。
					alias: [
						{
							find: 'cloudflare:workers',
							replacement: fileURLToPath(
								new URL('./src/lib/server/test-cloudflare-workers.ts', import.meta.url)
							)
						}
					],
					// scripts/ は Node で動く道具（データ投入など）、e2e/ の seed.ts も Node で動く。ここの単体テストも Node で回す。
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'scripts/**/*.{test,spec}.ts',
						'e2e/**/*.{test,spec}.ts'
					],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
