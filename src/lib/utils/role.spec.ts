import { describe, expect, it } from 'vitest';
import { isAdmin } from './role';

describe('isAdmin', () => {
	it('admin だけ true', () => {
		expect(isAdmin({ role: 'admin' })).toBe(true);
		expect(isAdmin({ role: 'user' })).toBe(false);
	});

	it('未ログイン（null / undefined）は false', () => {
		// 共有ページのようにユーザーがいない文脈でも呼ばれる。
		expect(isAdmin(null)).toBe(false);
		expect(isAdmin(undefined)).toBe(false);
	});
});
