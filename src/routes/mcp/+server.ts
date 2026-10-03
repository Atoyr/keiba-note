import { error, json } from '@sveltejs/kit';
import { MCP_BODY_LIMIT, readLimitedText } from '$lib/server/auth/limited-body';
import { bearerChallenge } from '$lib/server/auth/oauth-metadata';
import { handleMcpMessage, PROTOCOL_VERSIONS } from '$lib/server/mcp/protocol';
import { ctx } from '$lib/server/util';
import type { RequestHandler } from './$types';

/**
 * MCP の口（Streamable HTTP・ステートレス）。認証は hooks.server.ts が Bearer で済ませてある。
 * ここは HTTP の出入りだけで、中身は `lib/server/mcp/protocol.ts`。
 */
export const POST: RequestHandler = async ({ request, locals, platform, url }) => {
	// ブラウザから来た要求は自分のオリジンだけ（MCP の仕様の DNS rebinding 対策）。
	// Claude・ChatGPT はサーバーから呼ぶので Origin を付けない。
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, '別のオリジンからは呼べません');

	const version = request.headers.get('mcp-protocol-version');
	if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32600, message: `知らない版です: ${version}` } },
			{ status: 400 }
		);
	}

	const { db, user } = ctx(locals, platform);
	// hooks を通った /mcp なら必ずある。無ければ Cookie で来た要求で、ここに来るのは誤り。
	const scopes = locals.oauthScopes;
	if (!scopes) error(401, 'アクセストークンが必要です');

	// 予想を書く tool は見立てと出走馬ぶんの本文を運ぶので、OAuth の口（8 KiB）より大きく取る。
	// それでも読みながら数えて止める（limited-body.ts）。
	const text = await readLimitedText(request, MCP_BODY_LIMIT);
	if (text === null) {
		return json(
			{
				jsonrpc: '2.0',
				id: null,
				error: {
					code: -32600,
					message:
						'本文が大きすぎます（64 KiB まで）。予想を書くなら、出走馬を分けて何回かに送ってください'
				}
			},
			{ status: 413, headers: { 'Cache-Control': 'no-store' } }
		);
	}
	let message: unknown;
	try {
		message = JSON.parse(text);
	} catch {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON として読めません' } },
			{ status: 400 }
		);
	}

	const reply = await handleMcpMessage(message, { db, viewerId: user.id, scopes });
	const headers = { 'Cache-Control': 'no-store' };
	switch (reply.kind) {
		case 'accepted':
			return new Response(null, { status: 202, headers });
		case 'insufficientScope':
			return json(reply.body, {
				status: 403,
				headers: {
					...headers,
					'WWW-Authenticate': bearerChallenge(url.origin, {
						code: 'insufficient_scope',
						scope: reply.scope
					})
				}
			});
		case 'json':
			return json(reply.body, { status: reply.status, headers });
	}
};

/** サーバーから送る SSE の流れは持たない（仕様では GET に 405 を返してよい）。 */
const notAllowed: RequestHandler = () =>
	new Response(null, { status: 405, headers: { Allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
