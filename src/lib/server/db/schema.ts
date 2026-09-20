import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle スキーマ。
 *
 * 本体のテーブル定義（user / session / invite / horse / race / race_entry / note）は
 * Phase 1 以降で追加する。docs/design.md 第5章を参照。
 */

/**
 * Phase 0 の疎通用。schema.ts → `drizzle-kit generate` →
 * `wrangler d1 migrations apply` の経路が通っていることを示すためだけに置いてある。
 * 不要になったら Phase 1 のマイグレーションで DROP してよい。
 */
export const schemaMeta = sqliteTable('schema_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
