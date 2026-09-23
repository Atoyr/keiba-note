import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { instrumentD1, type QueryObserver } from './instrument';
import * as schema from './schema';

/**
 * リクエストごとに Drizzle クライアントを作る。
 *
 * Workers の実行環境は複数リクエストで再利用されるため、モジュールスコープに
 * 接続やユーザー情報を保持するとリクエスト間で漏れる。生成自体はほぼコストゼロ
 * なので毎回作ってよい（D1 はバインディング経由の RPC で、接続プールは存在しない）。
 *
 * `observe` はクエリの時間と失敗を受け取る（`locals.monitor.onQuery`）。
 * 省略可能にしないのは、渡し忘れた経路だけ D1 の失敗が監視から漏れるのを防ぐため。
 */
export function createDb(env: App.Platform['env'], observe: QueryObserver) {
	return drizzle(instrumentD1(env.DB, observe), { schema });
}

export type Db = ReturnType<typeof createDb>;

/** 死活監視（`/api/health`）用。D1 に `select 1` が通るか。 */
export async function pingDb(db: Db): Promise<boolean> {
	try {
		await db.run(sql`select 1`);
		return true;
	} catch {
		// 中身は createDb に渡した observer が d1.query.failed として記録している。
		return false;
	}
}

export { schema };
export type { QueryObserver, QueryReport } from './instrument';
