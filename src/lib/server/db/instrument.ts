/**
 * D1 の binding を包んで、クエリごとの所要時間と失敗を外に知らせる。
 *
 * Drizzle の D1 ドライバが使うのは `prepare` → `bind` → `all` / `run` / `raw` と `batch` だけなので、
 * そこを包む。ここは「測って渡す」だけで、ログに出すか・通知するかは知らない
 * （判断は `lib/server/monitoring/monitor.ts` の `classifyQuery`。db 層は monitoring を import しない）。
 *
 * バインドした値（メモの本文など）は observer に渡さない。渡すのは SQL の文だけ。
 */

export type QueryReport = {
	/** SQL の文。`batch` は文を `; ` でつないだもの。値は入らない（`?` のまま）。 */
	sql: string;
	kind: 'statement' | 'batch' | 'exec';
	durationMs: number;
	/** 失敗したときだけ。呼び出し元にはそのまま投げ直す。 */
	error?: unknown;
};

export type QueryObserver = (report: QueryReport) => void;

type Clock = () => number;

export function instrumentD1(
	d1: D1Database,
	observe: QueryObserver,
	now: Clock = () => performance.now()
): D1Database {
	/**
	 * `batch` に渡ってくるのは包んだ文なので、D1 には元の文を渡し直す。
	 * 包んだ文をそのまま渡すと、ランタイムが D1 の文として受け付けない。
	 */
	const originals = new WeakMap<object, { stmt: D1PreparedStatement; sql: string }>();

	/** observer の不具合でクエリ自体を落とさない。 */
	function report(r: QueryReport) {
		try {
			observe(r);
		} catch {
			// 監視の失敗は握りつぶす。本来の処理を壊さないことを優先する。
		}
	}

	async function timed<T>(sql: string, kind: QueryReport['kind'], run: () => Promise<T>) {
		const start = now();
		try {
			const result = await run();
			report({ sql, kind, durationMs: now() - start });
			return result;
		} catch (error) {
			report({ sql, kind, durationMs: now() - start, error });
			throw error;
		}
	}

	function wrap(stmt: D1PreparedStatement, sql: string): D1PreparedStatement {
		const wrapped = {
			bind: (...values: unknown[]) => wrap(stmt.bind(...values), sql),
			first: (column?: string) =>
				timed(sql, 'statement', () => (column === undefined ? stmt.first() : stmt.first(column))),
			run: () => timed(sql, 'statement', () => stmt.run()),
			all: () => timed(sql, 'statement', () => stmt.all()),
			raw: (options?: { columnNames?: boolean }) =>
				timed(sql, 'statement', () =>
					options?.columnNames ? stmt.raw({ columnNames: true }) : stmt.raw()
				)
		};
		originals.set(wrapped, { stmt, sql });
		return wrapped as unknown as D1PreparedStatement;
	}

	const instrumented = {
		prepare: (sql: string) => wrap(d1.prepare(sql), sql),
		batch: <T>(statements: D1PreparedStatement[]) => {
			const unwrapped = statements.map((s) => originals.get(s) ?? { stmt: s, sql: '?' });
			const sql = unwrapped.map((u) => u.sql).join('; ');
			return timed(sql, 'batch', () => d1.batch<T>(unwrapped.map((u) => u.stmt)));
		},
		exec: (sql: string) => timed(sql, 'exec', () => d1.exec(sql)),
		// 使っていないものは測らずに素通しする。
		withSession: (...args: Parameters<D1Database['withSession']>) => d1.withSession(...args),
		dump: () => d1.dump()
	};
	return instrumented as unknown as D1Database;
}
