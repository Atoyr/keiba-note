import * as v from 'valibot';
import { isOwnResource, tokenRequestSchema } from '$lib/schemas/oauth';
import type { Db } from '$lib/server/db';
import { exchangeAuthorizationCode, refreshTokens, type TokenError } from './oauth';

/**
 * トークンの口（`POST /oauth/token`）。src/worker.js が SvelteKit より先に受けてここを呼ぶ。
 *
 * **SvelteKit に通さない理由:** トークンの要求は `application/x-www-form-urlencoded` の POST で、
 * Claude・ChatGPT のサーバーから Origin なしで来る。SvelteKit の CSRF の検査はこれを
 * 「別サイトからのフォーム送信」として hooks より前に 403 で落とし、パスごとに外す設定も無い。
 * この口は Cookie を見ず、コード・PKCE・リフレッシュトークンだけで判断するので、CSRF の検査が守るものが無い。
 *
 * SvelteKit を import しない（Request と Response だけ）。
 */
export async function handleTokenRequest(request: Request, db: Db | null): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response(null, { status: 405, headers: { Allow: 'POST' } });
	}
	if (!db) return reply({ error: 'temporarily_unavailable' }, 503);

	const type = request.headers.get('content-type') ?? '';
	if (!type.startsWith('application/x-www-form-urlencoded')) {
		return invalidRequest('application/x-www-form-urlencoded で送ってください');
	}
	const form = new URLSearchParams(await request.text());
	const fields: Record<string, string> = {};
	for (const [k, val] of form) {
		// 同じ項目が2回来たら受けない（RFC 6749 3.2）。
		if (k in fields) return invalidRequest(`${k} が重複しています`);
		fields[k] = val;
	}
	// 公開クライアントは本文に client_id を入れる。Basic で送ってくるクライアントもあるので、そちらも読む。
	fields.client_id ??= basicClientId(request.headers.get('authorization')) ?? '';

	const parsed = v.safeParse(tokenRequestSchema, fields);
	if (!parsed.success) {
		if (fields.grant_type && !['authorization_code', 'refresh_token'].includes(fields.grant_type)) {
			return reply({ error: 'unsupported_grant_type' }, 400);
		}
		return invalidRequest(parsed.issues[0].message);
	}
	const input = parsed.output;
	if (!isOwnResource(input.resource, new URL(request.url).origin)) {
		return reply({ error: 'invalid_target', error_description: 'resource が違います' }, 400);
	}

	const result =
		input.grant_type === 'authorization_code'
			? await exchangeAuthorizationCode(db, {
					code: input.code,
					clientId: input.client_id,
					redirectUri: input.redirect_uri,
					codeVerifier: input.code_verifier
				})
			: await refreshTokens(db, {
					refreshToken: input.refresh_token,
					clientId: input.client_id,
					scope: input.scope
				});
	if ('error' in result) return reply(result, statusOf(result));
	return reply(result, 200);
}

const statusOf = (e: TokenError) => (e.error === 'invalid_client' ? 401 : 400);

const invalidRequest = (error_description: string) =>
	reply({ error: 'invalid_request', error_description }, 400);

function basicClientId(header: string | null): string | null {
	const m = /^Basic\s+(\S+)$/i.exec(header ?? '');
	if (!m) return null;
	try {
		// `client_id:client_secret`。公開クライアントは秘密が空。
		const [id] = atob(m[1]).split(':');
		return id ? decodeURIComponent(id) : null;
	} catch {
		return null;
	}
}

/** トークンを含む応答はどこにも残させない（RFC 6749 5.1）。 */
function reply(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			Pragma: 'no-cache'
		}
	});
}
