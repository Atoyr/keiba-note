import { MCP_PATH } from '$lib/server/auth/oauth-metadata';
import { TOOLS } from '$lib/server/mcp/tools';
import type { PageServerLoad } from './$types';

/**
 * MCP の登録の案内。DB には触らない。接続先の URL（/settings/connections と同じ組み立て）と、
 * AI が使える tool の一覧を渡す。tool は lib/server/mcp/tools.ts が正で、ここで写さない
 * （tool を足しても案内が古いまま残らないように）。説明は AI 向けの文なので、画面には title を出す。
 */
export const load: PageServerLoad = ({ url }) => ({
	mcpUrl: `${url.origin}${MCP_PATH}`,
	tools: TOOLS.map((t) => ({ name: t.name, title: t.title, scope: t.scope }))
});
