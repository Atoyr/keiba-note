import { describe, expect, it, vi } from 'vitest';

vi.mock('drizzle-orm/d1', () => ({
	drizzle: vi.fn((binding: unknown) => ({ __binding: binding }))
}));

import { drizzle } from 'drizzle-orm/d1';
import { createDb } from './index';

describe('createDb', () => {
	it('リクエストごとに新しいクライアントを作り、モジュールスコープに保持しない', () => {
		const env = { DB: { name: 'd1' } } as unknown as App.Platform['env'];

		const a = createDb(env);
		const b = createDb(env);

		expect(drizzle).toHaveBeenCalledTimes(2);
		expect(a).not.toBe(b);
	});
});
