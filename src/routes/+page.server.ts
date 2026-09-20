import { sql } from 'drizzle-orm';
import { createDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/**
 * Phase 0 の疎通確認。D1 バインディングに触れて往復できるかだけを見る。
 * Phase 4 でダッシュボード（最近のメモ / 直近のレース）に置き換える。
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
