import { sql } from 'drizzle-orm';
import { createDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/**
 * Phase 4 でダッシュボード（最近のメモ / 直近のレース）に置き換える。
 * 今は D1 の疎通結果だけを出す。
 */
export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) {
		return { db: { ok: false, detail: 'D1 バインディング DB が見つかりません' } };
	}

	try {
		const db = createDb(platform.env);
		await db.run(sql`select 1`);
		return { db: { ok: true, detail: 'D1 に接続できました' } };
	} catch (e) {
		return { db: { ok: false, detail: e instanceof Error ? e.message : String(e) } };
	}
};
