import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	clientRegistrationSchema,
	isAllowedRedirectUri,
	isOwnResource,
	knownScopes,
	redirectUriMatches,
	requestedScopes
} from './oauth';

describe('requestedScopes', () => {
	it('scope が無ければ全部を求めたとみなす', () => {
		expect(requestedScopes(undefined)).toEqual(['races:read', 'notes:read']);
		expect(requestedScopes('')).toEqual(['races:read', 'notes:read']);
	});

	it('races:read だけを求められたら、メモは含めない', () => {
		expect(requestedScopes('races:read')).toEqual(['races:read']);
	});

	it('notes:read だけでも、外せない races:read を足す', () => {
		expect(requestedScopes('notes:read')).toEqual(['races:read', 'notes:read']);
	});

	it('知らないスコープは捨てる。書き込みのような無いスコープで広がらない', () => {
		expect(requestedScopes('openid races:read notes:write admin')).toEqual(['races:read']);
		// 知っているものが1つも無いときは全部（読むだけの2つ）。
		expect(requestedScopes('openid profile')).toEqual(['races:read', 'notes:read']);
	});

	it('DB に残った知らないスコープは効かない', () => {
		expect(knownScopes(['notes:write', 'notes:read'])).toEqual(['notes:read']);
	});
});

describe('戻り先', () => {
	it('https とループバックの http だけを登録できる', () => {
		expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
		expect(isAllowedRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
		expect(isAllowedRedirectUri('http://localhost:8080/cb')).toBe(true);
		expect(isAllowedRedirectUri('http://evil.example/cb')).toBe(false);
		expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
		expect(isAllowedRedirectUri('https://example.com/cb#frag')).toBe(false);
		expect(isAllowedRedirectUri('https://user:pass@example.com/cb')).toBe(false);
		expect(isAllowedRedirectUri('not a url')).toBe(false);
	});

	it('完全一致だけ。パスやクエリが違えば通さない', () => {
		const reg = ['https://claude.ai/api/mcp/auth_callback'];
		expect(redirectUriMatches(reg, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
		expect(redirectUriMatches(reg, 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false);
		expect(redirectUriMatches(reg, 'https://claude.ai/other')).toBe(false);
		expect(redirectUriMatches(reg, 'https://evil.example/api/mcp/auth_callback')).toBe(false);
	});

	it('ループバックだけはポートを問わない', () => {
		const reg = ['http://127.0.0.1:1234/callback'];
		expect(redirectUriMatches(reg, 'http://127.0.0.1:5555/callback')).toBe(true);
		expect(redirectUriMatches(reg, 'http://127.0.0.1:5555/other')).toBe(false);
		expect(redirectUriMatches(reg, 'http://localhost:5555/callback')).toBe(false);
		// https の登録先はポートも含めて一致が要る。
		expect(redirectUriMatches(['https://a.example/cb'], 'https://a.example:8443/cb')).toBe(false);
	});
});

describe('clientRegistrationSchema', () => {
	it('公開クライアントだけを受ける', () => {
		const ok = { client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] };
		expect(v.is(clientRegistrationSchema, ok)).toBe(true);
		expect(
			v.is(clientRegistrationSchema, { ...ok, token_endpoint_auth_method: 'client_secret_post' })
		).toBe(false);
	});

	it('戻り先が無い・許されない先なら受けない', () => {
		expect(v.is(clientRegistrationSchema, { redirect_uris: [] })).toBe(false);
		expect(v.is(clientRegistrationSchema, { redirect_uris: ['http://evil.example/cb'] })).toBe(
			false
		);
	});
});

describe('isOwnResource', () => {
	it('自分の /mcp か、無指定だけを通す', () => {
		const origin = 'https://uma-memo.com';
		expect(isOwnResource(undefined, origin)).toBe(true);
		expect(isOwnResource('https://uma-memo.com/mcp', origin)).toBe(true);
		expect(isOwnResource('https://other.example/mcp', origin)).toBe(false);
	});
});
