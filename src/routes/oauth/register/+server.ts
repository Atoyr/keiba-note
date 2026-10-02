import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { clientRegistrationSchema } from '$lib/schemas/oauth';
import { registerClient } from '$lib/server/auth/oauth';
import { createDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * 動的クライアント登録（RFC 7591）。**ログイン不要**（PUBLIC_PATHS）。
 *
 * Claude・ChatGPT はコネクタを足すときにここで自分を登録する。登録だけでは何も読めない
 * （本人が同意画面で許可して初めて grant ができる）。受けるのは公開クライアントだけで、秘密鍵は出さない。
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!platform?.env?.DB) {
		return json({ error: 'temporarily_unavailable' }, { status: 503 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'invalid_client_metadata', error_description: 'JSON として読めません' },
			{ status: 400 }
		);
	}
	const parsed = v.safeParse(clientRegistrationSchema, body);
	if (!parsed.success) {
		const uriIssue = parsed.issues.some((i) => v.getDotPath(i)?.startsWith('redirect_uris'));
		return json(
			{
				error: uriIssue ? 'invalid_redirect_uri' : 'invalid_client_metadata',
				error_description: parsed.issues[0].message
			},
			{ status: 400 }
		);
	}
	const db = createDb(platform.env, locals.monitor.onQuery);
	const client = await registerClient(db, {
		name: parsed.output.client_name,
		redirectUris: parsed.output.redirect_uris
	});
	return json(
		{
			client_id: client.id,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_name: client.name,
			redirect_uris: client.redirectUris,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code']
		},
		{ status: 201, headers: { 'Cache-Control': 'no-store' } }
	);
};
