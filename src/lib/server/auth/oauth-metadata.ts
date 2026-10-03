import { OAUTH_SCOPES } from '$lib/schemas/oauth';

/**
 * MCP クライアントが最初に読む、認可の案内（メタデータ）。クライアントはこれを見て
 * どこで登録し、どこで認可を受け、どこでトークンをもらうかを知る。
 *
 * 認可サーバーとリソースサーバー（`/mcp`）は同じ Worker・同じオリジン。
 */

export const MCP_PATH = '/mcp';

/** 保護されたリソースのメタデータ（RFC 9728）の URL。401 の WWW-Authenticate に載せる。 */
export function resourceMetadataUrl(origin: string): string {
	return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

export function protectedResourceMetadata(origin: string) {
	return {
		resource: `${origin}${MCP_PATH}`,
		authorization_servers: [origin],
		scopes_supported: [...OAUTH_SCOPES],
		bearer_methods_supported: ['header'],
		resource_name: 'uma-memo'
	};
}

/** 認可サーバーのメタデータ（RFC 8414）。 */
export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		scopes_supported: [...OAUTH_SCOPES],
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none'],
		code_challenge_methods_supported: ['S256'],
		authorization_response_iss_parameter_supported: true,
		// Client ID Metadata Document（Claude の推奨）。動的登録（registration_endpoint）と両方を受ける。
		client_id_metadata_document_supported: true
	};
}

/** `/mcp` が Bearer を受けられなかったときの WWW-Authenticate（RFC 6750 / MCP の認可の仕様）。 */
export function bearerChallenge(
	origin: string,
	error?: { code: 'invalid_token' | 'insufficient_scope'; scope?: string }
): string {
	const parts = [`resource_metadata="${resourceMetadataUrl(origin)}"`];
	if (error) parts.push(`error="${error.code}"`);
	if (error?.scope) parts.push(`scope="${error.scope}"`);
	return `Bearer ${parts.join(', ')}`;
}
