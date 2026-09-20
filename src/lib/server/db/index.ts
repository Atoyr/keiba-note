import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * リクエストごとに Drizzle クライアントを作る。
 *
 * Workers の実行環境は複数リクエストで再利用されるため、モジュールスコープに
 * 接続やユーザー情報を保持するとリクエスト間で漏れる。生成自体はほぼコストゼロ
 * なので毎回作ってよい（D1 はバインディング経由の RPC で、接続プールは存在しない）。
 */
export function createDb(env: App.Platform['env']) {
	return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;

export { schema };
