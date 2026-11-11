import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const kit = ['@sveltejs/kit', '@sveltejs/kit/*', '$app/*'];
const drizzle = ['drizzle-orm', 'drizzle-orm/*'];
const oauthLibs = ['arctic', '@oslojs/*'];
const serverLib = ['$lib/server', '$lib/server/*'];

/**
 * パッケージ単位の禁止（architecture.md 第2章）。ファイル間の向き・横の軸は言葉の約束のまま（harness.md 第2章）。
 * **flat config は、同じルールを持つブロックに複数当たると後ろのブロックで丸ごと置き換わる（足し合わされない）。**
 * だから各ファイルがどれか1つのブロックだけに当たるよう files を分けてある。ここを足すときも重ならないようにする。
 * `import type` も止める（画面側は型ですら import しない約束）。
 */
const restrict = (files, patterns) => ({
	files,
	ignores: ['**/*.spec.ts', '**/*.test.ts', 'src/lib/server/db/test-d1.ts'],
	rules: { 'no-restricted-imports': ['error', { patterns }] }
});
const ban = (group, message) => ({ group, message });

const KIT_MSG =
	'SvelteKit に依存するのはルートとフックだけ。ここは SvelteKit を import しない。必要な値は引数で受け取る（architecture.md 第2章）';
const DRIZZLE_MSG =
	'ルートと画面は SQL を組まない。問い合わせは lib/server/services/ に置いて呼ぶ（architecture.md 第2章）';
const OAUTH_MSG =
	'arctic・@oslojs/* を使ってよいのは lib/server/auth/ だけ。必要なら auth/ に関数を足して呼ぶ（architecture.md 第2章）';
const SERVER_MSG =
	'画面側はサーバーのコードを型ですら import しない。+page.server.ts が返す値の型は ./$types から取る（architecture.md 第2章）';

const importRules = [
	restrict(
		['src/lib/server/services/**', 'src/lib/server/db/**'],
		[ban(kit, KIT_MSG), ban(oauthLibs, OAUTH_MSG)]
	),
	restrict(['src/lib/server/auth/**'], [ban(kit, KIT_MSG)]),
	restrict(
		['src/lib/server/mcp/**'],
		[
			ban(kit, KIT_MSG),
			ban(
				drizzle,
				'MCP の tool は SQL を組まない。問い合わせは lib/server/services/ に置いて呼ぶ（architecture.md 第2章）'
			),
			ban(oauthLibs, OAUTH_MSG),
			ban(
				['$lib/server/auth', '$lib/server/auth/*'],
				'MCP は認証を自分では扱わない。viewerId は hooks が確かめたトークンの持ち主から受け取る（architecture.md 第0章）'
			)
		]
	),
	restrict(
		['src/lib/schemas/**', 'src/lib/utils/**', 'src/lib/utils.ts'],
		[
			ban(
				kit,
				'schemas と utils は pure に保つ。SvelteKit に触るものは components か routes に置く（architecture.md 第2章）'
			),
			ban(drizzle, DRIZZLE_MSG),
			ban(oauthLibs, OAUTH_MSG),
			ban(
				serverLib,
				'schemas と utils はサーバーのコードを import しない。共有したいものはこちら側に置く（architecture.md 第2章）'
			)
		]
	),
	restrict(
		['src/routes/**/*.server.ts', 'src/routes/**/+server.ts', 'src/hooks.server.ts'],
		[ban(drizzle, DRIZZLE_MSG), ban(oauthLibs, OAUTH_MSG)]
	),
	restrict(
		[
			'src/lib/components/**',
			'src/lib/webmcp/**',
			'src/routes/**/*.svelte',
			'src/routes/**/+page.ts',
			'src/routes/**/+layout.ts'
		],
		[ban(drizzle, DRIZZLE_MSG), ban(oauthLibs, OAUTH_MSG), ban(serverLib, SERVER_MSG)]
	)
];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// `wrangler types` の生成物。整形も lint もしない。
	{ ignores: ['worker-configuration.d.ts', '.svelte-kit/', 'drizzle/', 'src/lib/components/ui/'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	...importRules,
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
