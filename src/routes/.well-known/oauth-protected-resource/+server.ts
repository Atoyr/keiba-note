import { json } from '@sveltejs/kit';
import { protectedResourceMetadata } from '$lib/server/auth/oauth-metadata';
import type { RequestHandler } from './$types';

/**
 * 保護されたリソースのメタデータ（RFC 9728）。MCP クライアントは 401 の WWW-Authenticate から
 * `/mcp` の付いた方を読むが、付いていない方を探すクライアントもあるので両方に置く。
 * 公開してよい案内だけで、DB には触らない。
 */
export const GET: RequestHandler = ({ url }) =>
	json(protectedResourceMetadata(url.origin), {
		headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
	});
