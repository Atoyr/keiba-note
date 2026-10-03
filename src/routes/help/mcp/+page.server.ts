import { MCP_PATH } from '$lib/server/auth/oauth-metadata';
import type { PageServerLoad } from './$types';

/** MCP の登録の案内。DB には触らない。接続先の URL だけを渡す（/settings/connections と同じ組み立て）。 */
export const load: PageServerLoad = ({ url }) => ({ mcpUrl: `${url.origin}${MCP_PATH}` });
