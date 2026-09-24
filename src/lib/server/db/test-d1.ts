/**
 * **テスト専用。** マイグレーションを流した SQLite（node:sqlite）を D1 の binding の形で包み、
 * 本物と同じ Drizzle の D1 ドライバで読み書きできるようにする。
 *
 * D1 も中身は SQLite なので、UNIQUE・CHECK・ON CONFLICT・CASCADE は本番と同じに効く。
 * Drizzle の D1 ドライバが使うのは `prepare` → `bind` → `all` / `run` / `raw` と `batch` だけなので
 * （`instrument.ts` と同じ前提）、そこだけを実装する。
 *
 * アプリのコードからは import しない（node:sqlite は Workers に無い）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/d1';
import type { Db } from './index';
import * as schema from './schema';

class Statement {
	constructor(
		private readonly sqlite: DatabaseSync,
		readonly sql: string,
		private readonly params: SQLInputValue[] = []
	) {}

	bind(...params: unknown[]) {
		return new Statement(this.sqlite, this.sql, params as SQLInputValue[]);
	}

	#prepare() {
		return this.sqlite.prepare(this.sql);
	}

	isReader() {
		return this.#prepare().columns().length > 0;
	}

	async all() {
		return { results: this.#prepare().all(...this.params), success: true, meta: {} };
	}

	async first() {
		return this.#prepare().get(...this.params) ?? null;
	}

	async raw() {
		const stmt = this.#prepare();
		stmt.setReturnArrays(true);
		return stmt.all(...this.params);
	}

	async run() {
		const r = this.#prepare().run(...this.params);
		return {
			results: [],
			success: true,
			meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }
		};
	}
}

/** D1 の `batch` と同じく、全部を1トランザクションで流す。1つでも落ちれば何も残らない。 */
function binding(sqlite: DatabaseSync) {
	return {
		prepare: (sql: string) => new Statement(sqlite, sql),
		async batch(statements: Statement[]) {
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const s of statements) results.push(await (s.isReader() ? s.all() : s.run()));
				sqlite.exec('COMMIT');
				return results;
			} catch (e) {
				sqlite.exec('ROLLBACK');
				throw e;
			}
		},
		async exec(sql: string) {
			sqlite.exec(sql);
			return { count: 1, duration: 0 };
		}
	};
}

/** マイグレーションをすべて流した空の DB。`sqlite` は検査用に直接叩く口。 */
export function createTestDb(): { db: Db; sqlite: DatabaseSync } {
	// drizzle の生成した 0008 は、古い note に無い列を "tags" と書いて SELECT している。
	// D1 はダブルクォートを文字列として読むので通る。同じ扱いにしないと流せない。
	const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
	sqlite.exec('PRAGMA foreign_keys = ON');
	const dir = 'drizzle';
	for (const f of readdirSync(dir)
		.filter((f) => f.endsWith('.sql'))
		.sort()) {
		for (const stmt of readFileSync(join(dir, f), 'utf8').split('--> statement-breakpoint')) {
			if (stmt.trim()) sqlite.exec(stmt);
		}
	}
	const db = drizzle(binding(sqlite) as unknown as D1Database, { schema }) as unknown as Db;
	return { db, sqlite };
}
