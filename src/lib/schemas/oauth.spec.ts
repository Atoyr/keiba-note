import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	clientRegistrationSchema,
	isClientIdMetadataUrl,
	consentSchema,
	grantedScopes,
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

describe('grantedScopes（同意で許すスコープ）', () => {
	it('チェックを残したものだけ。外せない races:read は必ず入る', () => {
		expect(grantedScopes(['races:read', 'notes:read'], ['notes:read'])).toEqual([
			'races:read',
			'notes:read'
		]);
		// チェックを全部外しても races:read だけになる（空にはならない）。
		expect(grantedScopes(['races:read', 'notes:read'], [])).toEqual(['races:read']);
	});

	it('求められていないスコープは、チェックの値に足して送られても許さない', () => {
		// アプリは races:read だけを求めた。フォームを書き換えて notes:read や知らない値を足しても広がらない。
		expect(grantedScopes(['races:read'], ['notes:read', 'notes:write', 'admin'])).toEqual([
			'races:read'
		]);
	});
});

describe('consentSchema', () => {
	it('押されたボタンは allow か deny だけ', () => {
		expect(v.is(consentSchema, { decision: 'allow', scope_grant: [] })).toBe(true);
		expect(v.is(consentSchema, { decision: 'yes', scope_grant: [] })).toBe(false);
		expect(v.is(consentSchema, { scope_grant: [] })).toBe(false);
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

describe('isClientIdMetadataUrl', () => {
	it('パスのある https の URL を受ける', () => {
		expect(isClientIdMetadataUrl('https://claude.ai/oauth/client.json')).toBe(true);
	});

	it.each([
		'https://claude.ai',
		'https://claude.ai/',
		'https://claude.ai/a/../b.json',
		'https://claude.ai/./c.json',
		'https://claude.ai/c.json#x',
		'https://claude.ai/c.json?x=1',
		'https://user:pw@claude.ai/c.json',
		'https://10.0.0.1/c.json',
		'https://[::1]/c.json',
		'https://intranet/c.json',
		'http://claude.ai/c.json',
		'ftp://claude.ai/c.json',
		'uma_client_abc',
		`https://claude.ai/${'a'.repeat(2001)}`
	])('%s は受けない', (url) => {
		expect(isClientIdMetadataUrl(url)).toBe(false);
	});

	it('http://localhost は E2E の許可があるときだけ受ける', () => {
		expect(isClientIdMetadataUrl('http://localhost:5555/c.json')).toBe(false);
		expect(isClientIdMetadataUrl('http://localhost:5555/c.json', true)).toBe(true);
		expect(isClientIdMetadataUrl('http://127.0.0.1:5555/c.json', true)).toBe(false);
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
