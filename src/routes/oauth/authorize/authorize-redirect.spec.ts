import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect, redirect } from '@sveltejs/kit';
import { resolveClient } from '$lib/server/auth/client-metadata';
import { actions } from './+page.server';

vi.mock('$lib/server/util', () => ({ ctx: () => ({ db: {}, user: { id: 'me' } }) }));
vi.mock('$lib/server/auth/oauth', () => ({ createAuthorizationCode: async () => 'CODE' }));
vi.mock('$lib/server/auth/client-metadata', () => ({ resolveClient: vi.fn() }));

const ORIGIN = 'https://uma-memo.test';

/** 同意の POST を投げ、`redirect()` が投げたものを返す（SvelteKit 3 は外へのリダイレクトを既定で止める）。 */
async function submit(redirectUri: string, decision: 'allow' | 'deny') {
	vi.mocked(resolveClient).mockResolvedValue({
		ok: true,
		client: {
			id: 'client-1',
			name: 'テスト',
			redirectUris: [redirectUri],
			source: 'registered'
		}
	} as never);
	const form = new FormData();
	form.set('response_type', 'code');
	form.set('client_id', 'client-1');
	form.set('redirect_uri', redirectUri);
	form.set('code_challenge', 'a'.repeat(43));
	form.set('code_challenge_method', 'S256');
	form.set('state', 'xyz');
	form.set('scope', 'races:read');
	form.set('decision', decision);
	form.append('scope_grant', 'races:read');
	try {
		await actions.default!({
			request: new Request(`${ORIGIN}/oauth/authorize`, { method: 'POST', body: form }),
			url: new URL(`${ORIGIN}/oauth/authorize`),
			locals: {}
		} as unknown as Parameters<NonNullable<typeof actions.default>>[0]);
	} catch (e) {
		if (isRedirect(e)) return e;
		throw e;
	}
	throw new Error('redirect されなかった');
}

beforeEach(() => vi.clearAllMocks());

describe('同意・拒否のあと、登録済みの戻り先へ 303 で返す', () => {
	it.each([
		['https の戻り先', 'https://claude.ai/api/mcp/auth_callback'],
		['ループバックのポート付き（localhost）', 'http://localhost:54321/callback'],
		['ループバックのポート付き（127.0.0.1）', 'http://127.0.0.1:8080/oauth/callback']
	])('%s', async (_name, uri) => {
		const allowed = await submit(uri, 'allow');
		expect(allowed.status).toBe(303);
		const to = new URL(allowed.location);
		expect(`${to.origin}${to.pathname}`).toBe(new URL(uri).origin + new URL(uri).pathname);
		expect(to.searchParams.get('code')).toBe('CODE');
		expect(to.searchParams.get('state')).toBe('xyz');
		expect(to.searchParams.get('iss')).toBe(ORIGIN);

		const denied = await submit(uri, 'deny');
		expect(denied.status).toBe(303);
		expect(new URL(denied.location).searchParams.get('error')).toBe('access_denied');
	});
});

describe('外へのリダイレクトの許可の形（SvelteKit 3）', () => {
	// 登録できる戻り先は https とループバックの http だけ（isAllowedRedirectUri）なので、独自スキームは
	// この画面では出ないが、許可の形（protocol と host が同じなら通る）を確かめておく。
	it.each([
		'cursor://anysphere.cursor-mcp/oauth/callback?code=1&iss=x',
		'myapp:/oauth/callback?code=1',
		'http://localhost:3000/cb?code=1'
	])('戻り先自身を許せば通る: %s', (location) => {
		const registered = location.split('?')[0];
		let thrown: unknown;
		try {
			redirect(303, location, { external: [registered] });
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
	});

	it('許可していない外へは通らない（external を付けない・別のホスト）', () => {
		let thrown: unknown;
		try {
			redirect(303, 'https://evil.example/cb');
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(false);
		try {
			redirect(303, 'https://evil.example/cb', { external: ['https://claude.ai/cb'] });
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(false);
	});
});
