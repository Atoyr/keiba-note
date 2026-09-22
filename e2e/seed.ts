import { execSync } from 'node:child_process';

/**
 * E2E の前にローカル D1 へ行を流す（playwright.config.ts の `globalSetup`）。
 *
 * `wrangler dev` も `wrangler d1 execute --local` も同じ `.wrangler/state` を見るので、
 * ここで入れた行はプレビューサーバーから読める。`db:migrate:local` の後に走る前提
 * （CI もその順。`.github/workflows/ci.yml`）。
 */
export default function seed() {
	// 固定の文字列なので shell に渡して問題ない（pnpm は Windows では .cmd で、
	// shell 無しでは起動できない）。
	execSync('pnpm exec wrangler d1 execute k-note --local --file e2e/seed.sql', {
		stdio: 'inherit'
	});
}

/** 共有中のメモ。`/notes/[id]` で開ける。 */
export const SHARED_NOTE_ID = '01JE2ESHAREDNOTE0000000000';

/** 非公開のメモ。存在するが `/notes/[id]` では 404 になる。 */
export const PRIVATE_NOTE_ID = '01JE2EPRIVATENOTE000000000';
