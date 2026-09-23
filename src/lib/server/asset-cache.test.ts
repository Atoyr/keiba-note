import { describe, expect, it } from 'vitest';
import { uncacheFailure } from './asset-cache';

const IMMUTABLE = 'public, immutable, max-age=31536000';

describe('uncacheFailure', () => {
	it('immutable の付いた 404 は no-store にする', async () => {
		const res = uncacheFailure(
			new Response('Not Found', {
				status: 404,
				headers: { 'cache-control': IMMUTABLE, 'x-robots-tag': 'noindex' }
			})
		);

		expect(res.status).toBe(404);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-robots-tag')).toBe('noindex');
		expect(await res.text()).toBe('Not Found');
	});

	it('見つかったアセットの immutable はそのまま', () => {
		const original = new Response('x', { status: 200, headers: { 'cache-control': IMMUTABLE } });

		expect(uncacheFailure(original)).toBe(original);
	});

	it('immutable の付いていない失敗には手を出さない', () => {
		const original = new Response(null, {
			status: 404,
			headers: { 'cache-control': 'private, no-store' }
		});

		expect(uncacheFailure(original)).toBe(original);
	});
});
