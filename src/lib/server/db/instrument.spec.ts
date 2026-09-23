import { describe, expect, it } from 'vitest';
import { createDb, pingDb } from './index';
import { instrumentD1, type QueryReport } from './instrument';

/**
 * D1 の代わり。`batch` は自分が作った文しか受け付けない（本物のランタイムと同じ）。
 * 包んだ文をそのまま渡してしまう不具合は、ここで落ちる。
 */
function fakeD1(options: { fail?: Error } = {}) {
	const batches: FakeStatement[][] = [];

	class FakeStatement {
		constructor(
			readonly sql: string,
			readonly values: unknown[] = []
		) {}
		bind(...values: unknown[]) {
			return new FakeStatement(this.sql, values);
		}
		private result() {
			return options.fail
				? Promise.reject(options.fail)
				: Promise.resolve({ results: [{ one: 1 }], success: true, meta: {} });
		}
		all() {
			return this.result();
		}
		run() {
			return this.result();
		}
		raw() {
			return options.fail ? Promise.reject(options.fail) : Promise.resolve([[1]]);
		}
		first() {
			return options.fail ? Promise.reject(options.fail) : Promise.resolve({ one: 1 });
		}
	}

	const d1 = {
		prepare: (sql: string) => new FakeStatement(sql),
		batch: (statements: unknown[]) => {
			if (!statements.every((s) => s instanceof FakeStatement)) {
				return Promise.reject(new TypeError('D1_TYPE_ERROR: not a D1PreparedStatement'));
			}
			batches.push(statements as FakeStatement[]);
			return Promise.resolve(statements.map(() => ({ results: [], success: true, meta: {} })));
		},
		exec: () => Promise.resolve({ count: 1, duration: 0 }),
		withSession: () => d1,
		dump: () => Promise.resolve(new ArrayBuffer(0))
	};

	return { d1: d1 as unknown as D1Database, batches };
}

/** 呼ぶたびに 10ms 進む時計。 */
function steppingClock() {
	let t = 0;
	return () => (t += 10);
}

describe('instrumentD1', () => {
	it('成功したクエリの SQL と時間を渡し、結果はそのまま返す', async () => {
		const reports: QueryReport[] = [];
		const { d1 } = fakeD1();
		const db = instrumentD1(d1, (r) => reports.push(r), steppingClock());

		const result = await db.prepare('select * from note where id = ?').bind('秘密の本文').all();

		expect(result.results).toEqual([{ one: 1 }]);
		expect(reports).toEqual([
			{ sql: 'select * from note where id = ?', kind: 'statement', durationMs: 10 }
		]);
		// バインドした値は observer に渡らない。
		expect(JSON.stringify(reports)).not.toContain('秘密の本文');
	});

	it('失敗したクエリは error を付けて渡し、呼び出し元には同じエラーを投げ直す', async () => {
		const reports: QueryReport[] = [];
		const fail = new Error('D1_ERROR: no such table: nope');
		const db = instrumentD1(fakeD1({ fail }).d1, (r) => reports.push(r), steppingClock());

		await expect(db.prepare('select * from nope').run()).rejects.toBe(fail);
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({ sql: 'select * from nope', error: fail });
	});

	it('batch には元の文を渡し、SQL はつないで1件として渡す', async () => {
		const reports: QueryReport[] = [];
		const { d1, batches } = fakeD1();
		const db = instrumentD1(d1, (r) => reports.push(r), steppingClock());

		await db.batch([
			db.prepare('insert into a values (?)').bind(1),
			db.prepare('delete from b where id = ?').bind(2)
		]);

		expect(batches).toHaveLength(1);
		expect(batches[0].map((s) => s.values)).toEqual([[1], [2]]);
		expect(reports).toEqual([
			{
				sql: 'insert into a values (?); delete from b where id = ?',
				kind: 'batch',
				durationMs: 10
			}
		]);
	});

	it('observer が投げてもクエリは成功する', async () => {
		const db = instrumentD1(fakeD1().d1, () => {
			throw new Error('observer is broken');
		});

		await expect(db.prepare('select 1').first()).resolves.toEqual({ one: 1 });
	});
});

describe('createDb / pingDb', () => {
	const env = (d1: D1Database) => ({ DB: d1 }) as unknown as App.Platform['env'];

	it('Drizzle のクエリも observer に届き、通れば true', async () => {
		const reports: QueryReport[] = [];
		const db = createDb(env(fakeD1().d1), (r) => reports.push(r));

		expect(await pingDb(db)).toBe(true);
		expect(reports.map((r) => r.sql)).toEqual(['select 1']);
	});

	it('D1 が失敗すれば false を返し、投げない', async () => {
		const reports: QueryReport[] = [];
		const fail = new Error('D1_ERROR: Network connection lost.');
		const db = createDb(env(fakeD1({ fail }).d1), (r) => reports.push(r));

		expect(await pingDb(db)).toBe(false);
		expect(reports[0].error).toBe(fail);
	});
});
