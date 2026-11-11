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
// `$lib/server` を相対パスで書いても通さない。`svelte/server` のような npm パッケージには当たらないよう、`./` `../` で始まるものだけ見る。
const relServer = '^(\\.{1,2}/)+(.*/)?server(/|$)';
const authLib = ['$lib/server/auth', '$lib/server/auth/*'];
const relAuth = '^(\\.{1,2}/)+(.*/)?auth(/|$)';

/**
 * パッケージ単位の禁止（architecture.md 第2章）。ファイル間の向き・横の軸は言葉の約束のまま（harness.md 第2章）。
 *
 * **flat config は、同じルールを持つブロックに複数当たると後ろのブロックで丸ごと置き換わる（足し合わされない）。**
 * だから各ファイルがどれか1つのブロックだけに当たるよう files / ignores を分けてある。ここを足すときも重ならないようにする。
 * `import type` も止める（画面側は型ですら import しない約束）。
 */
const TEST_FILES = ['**/*.spec.ts', '**/*.test.ts', 'src/lib/server/db/test-d1.ts'];
const restrict = (files, patterns, ignores = []) => ({
	files,
	ignores: [...TEST_FILES, ...ignores],
	rules: { 'no-restricted-imports': ['error', { patterns }] }
});
/** group（パッケージ名・`$lib` の別名）と、あれば regex（相対パス）を同じ message で止める。 */
const ban = (group, message, regex) => [{ group, message }, ...(regex ? [{ regex, message }] : [])];

const KIT_MSG =
	'SvelteKit に依存するのはルート・フック・画面側（components）だけ。ここは SvelteKit を import しない。必要な値は引数で受け取る（architecture.md 第2章）';
const DRIZZLE_MSG =
	'ルートと画面は SQL を組まない。問い合わせは lib/server/services/ に置いて呼ぶ（architecture.md 第2章）';
const OAUTH_MSG =
	'arctic・@oslojs/* を使ってよいのは lib/server/auth/ だけ。必要なら auth/ に関数を足して呼ぶ（architecture.md 第2章）';
const SERVER_MSG =
	'画面側はサーバーのコードを型ですら import しない。+page.server.ts が返す値の型は ./$types から取る。部品なら、要る型は pure（lib/schemas・lib/utils）に置く（architecture.md 第2章）';

// Cron の入口（endpoint と同じ扱い）。service と同じ置き場の中で、ここだけ別のブロックに分ける。
const CRON_ENTRIES = ['src/lib/server/odds/scheduled.ts', 'src/lib/server/race-data/scheduled.ts'];

const importRules = [
	restrict(
		[
			'src/lib/server/services/**',
			'src/lib/server/db/**',
			'src/lib/server/og/**',
			'src/lib/server/odds/**',
			'src/lib/server/race-data/**',
			'src/lib/server/monitoring/**',
			// 応答に付けるヘッダの純関数（hooks が使う）。SvelteKit を知らない
			'src/lib/server/security-headers.ts'
		],
		[...ban(kit, KIT_MSG), ...ban(oauthLibs, OAUTH_MSG)],
		CRON_ENTRIES
	),
	restrict(['src/lib/server/auth/**'], ban(kit, KIT_MSG)),
	restrict(
		['src/lib/server/mcp/**'],
		[
			...ban(kit, KIT_MSG),
			...ban(
				drizzle,
				'MCP の tool は SQL を組まない。問い合わせは lib/server/services/ に置いて呼ぶ（architecture.md 第2章）'
			),
			...ban(oauthLibs, OAUTH_MSG),
			...ban(
				authLib,
				'MCP は認証を自分では扱わない。viewerId は hooks が確かめたトークンの持ち主から受け取る（architecture.md 第0章）',
				relAuth
			)
		]
	),
	restrict(
		['src/lib/schemas/**', 'src/lib/utils/**', 'src/lib/utils.ts'],
		[
			...ban(
				kit,
				'schemas と utils は pure に保つ。SvelteKit に触るものは components か routes に置く（architecture.md 第2章）'
			),
			...ban(drizzle, DRIZZLE_MSG),
			...ban(oauthLibs, OAUTH_MSG),
			...ban(
				serverLib,
				'schemas と utils はサーバーのコードを import しない。共有したいものはこちら側に置く（architecture.md 第2章）',
				relServer
			)
		]
	),
	restrict(
		[
			'src/routes/**/*.server.ts',
			'src/routes/**/+server.ts',
			'src/hooks.server.ts',
			'src/lib/server/util.ts',
			'src/lib/server/asset-cache.ts',
			...CRON_ENTRIES
		],
		[...ban(drizzle, DRIZZLE_MSG), ...ban(oauthLibs, OAUTH_MSG)]
	),
	restrict(
		[
			'src/lib/components/**',
			'src/lib/webmcp/**',
			'src/routes/**/*.svelte',
			'src/routes/**/*.svelte.ts',
			'src/routes/**/+page.ts',
			'src/routes/**/+layout.ts'
		],
		[
			...ban(drizzle, DRIZZLE_MSG),
			...ban(oauthLibs, OAUTH_MSG),
			...ban(serverLib, SERVER_MSG, relServer)
		]
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
