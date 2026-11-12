import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handleError } from './hooks.server';

/** handleError に渡す、必要なものだけ持つ event。 */
function setup() {
	const log = vi.fn();
	const event = {
		request: new Request('https://uma-memo.test/horses?q=secret', { method: 'GET' }),
		route: { id: '/horses' },
		locals: { monitor: { log } }
	} as unknown as RequestEvent;
	return { log, event };
}

describe('handleError（SvelteKit 3: kind で想定内と想定外を分ける）', () => {
	it('想定外（unknown）だけ request.unhandled を status 500 で記録し、何も返さない', () => {
		const { log, event } = setup();

		const result = handleError({ kind: 'unknown', error: new Error('boom'), event });

		expect(result).toBeUndefined();
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toMatchObject({
			level: 'error',
			event: 'request.unhandled',
			method: 'GET',
			// クエリ文字列（検索語）は出さず、ルートの形だけ出す
			route: '/horses',
			status: 500,
			dedupeKey: 'request.unhandled:/horses'
		});
	});

	it.each([
		['app（error() で投げたもの）', { kind: 'app', error: { message: 'no', status: 403 } }],
		['framework（404 など）', { kind: 'framework', error: { status: 404, message: 'Not Found' } }],
		[
			'validation',
			{ kind: 'validation', error: { status: 400, message: 'Bad' }, issues: [{ message: 'x' }] }
		]
	])('%s は記録も通知もしない', (_name, input) => {
		const { log, event } = setup();

		const result = handleError({ ...input, event } as unknown as Parameters<typeof handleError>[0]);

		expect(result).toBeUndefined();
		expect(log).not.toHaveBeenCalled();
	});
});
