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
	return { db: createDb(platform.env, locals.monitor.onQuery) as Db, user: locals.user };
}

/**
 * マスタ（馬・レース・出走馬）を書き換えられるのは admin だけ。
 *
 * 登録を誰にでも開いた以上、**全ユーザー共通のマスタを全員に開けない**。
 * `race_ident` の UNIQUE を他人に踏み荒らされると自分の記録も壊れる。
 * 一般ユーザーができるのは自分のメモの読み書きだけ（product.md 第4章 / 第9章 #10）。
 *
 * 「操作の可否」はルート層で弾く。データの絞り込みはサービス層（architecture.md 3-6）。
 */
export function ctxAdmin(locals: App.Locals, platform: App.Platform | undefined) {
	const c = ctx(locals, platform);
	if (c.user.role !== 'admin') error(403, 'この操作は管理者だけが行えます');
	return c;
}
