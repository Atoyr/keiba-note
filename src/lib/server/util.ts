import { error } from '@sveltejs/kit';
import { createDb, type Db } from '$lib/server/db';

/**
 * ルートから DB とログインユーザーを取り出す定型。
 * hooks.server.ts を通っている以上 user は非 null だが、型の上では nullable なので
 * ここで一度だけ潰す。
 */
export function ctx(locals: App.Locals, platform: App.Platform | undefined) {
	if (!platform?.env?.DB) error(503, 'データベースに接続できません');
	if (!locals.user) error(401, 'ログインが必要です');
	return { db: createDb(platform.env) as Db, user: locals.user };
}
