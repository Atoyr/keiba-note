import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$lib/server/util', () => ({ ctx: () => ({ db: {}, user: { id: 'A' } }) }));

const post = (request: Request) =>
	POST({
		request,
		url: new URL(request.url),
		locals: { oauthScopes: ['races:read'] }
	} as Parameters<typeof POST>[0]);

describe('MCP 本文の上限', () => {
	it.each([undefined, '1'])('Content-Length が %s でも読み取り中に止める', async (length) => {
		const cancel = vi.fn();
		let reads = 0;
		const request = new Request('https://uma-memo.test/mcp', {
			method: 'POST',
			headers: length ? { 'content-length': length } : {},
			body: new ReadableStream({
				pull(controller) {
					reads++;
					controller.enqueue(new Uint8Array(4096));
				},
				cancel
			}),
			duplex: 'half'
		} as RequestInit);
		const response = await post(request);
		expect(response.status).toBe(413);
		expect(await response.json()).toMatchObject({
			jsonrpc: '2.0',
			id: null,
			error: { code: -32600 }
		});
		expect(cancel).toHaveBeenCalledOnce();
		expect(reads).toBeLessThanOrEqual(4);
	});

	it.each([8192, 8193])('UTF-8 の %i バイト境界を確かめる', async (bytes) => {
		const json = JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'ping',
			padding: 'あ'.repeat(100)
		});
		const body = json + ' '.repeat(bytes - new TextEncoder().encode(json).length);
		const response = await post(new Request('https://uma-memo.test/mcp', { method: 'POST', body }));
		expect(response.status).toBe(bytes === 8192 ? 200 : 413);
	});

	it('上限内の不正 JSON は解析エラーで返す', async () => {
		const response = await post(
			new Request('https://uma-memo.test/mcp', { method: 'POST', body: '{' })
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: { code: -32700 } });
	});
});
