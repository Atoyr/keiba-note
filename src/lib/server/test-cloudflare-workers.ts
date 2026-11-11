/**
 * 単体テスト（Node）で `cloudflare:workers` の代わりになる小さな差し替え。
 * vite.config.ts の server プロジェクトが alias で向ける。実物は workerd の中にしか無い。
 *
 * `env` は空のオブジェクトで、spec が必要なバインディング（`env.DB` など）を差し込む。
 * 差し込んだものは `resetTestEnv()` で消す。
 */
export const env: Record<string, unknown> = {};

export function resetTestEnv(): void {
	for (const key of Object.keys(env)) delete env[key];
}

/** 頼まれた仕事は、拒否されても未処理にならないよう握りつぶすだけ。 */
export function waitUntil(task: Promise<unknown>): void {
	void task.catch(() => undefined);
}
