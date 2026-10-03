import { json } from '@sveltejs/kit';
import { authorizationServerMetadata } from '$lib/server/auth/oauth-metadata';
import type { RequestHandler } from './$types';

/** 認可サーバーのメタデータ（RFC 8414）。公開してよい案内だけで、DB には触らない。 */
export const GET: RequestHandler = ({ url }) =>
	json(authorizationServerMetadata(url.origin), {
		headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
	});
