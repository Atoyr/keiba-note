/**
 * OAuth の口（トークン・クライアント登録）と認証済みの MCP の口で、本文を上限つきで読む。
 *
 * `request.text()` は大きさを問わず全部を読む。Workers に届く本文は最大 100MB で、isolate のメモリを
 * 食い潰す要求をいくらでも送れてしまう。`Content-Length` は偽れるので、読みながら数えて止める。
 * 上限を超えたら null。
 */
export const OAUTH_BODY_LIMIT = 8 * 1024;

/**
 * `/mcp` の本文の上限。予想やふりかえりを書く tool（`save_my_race_preview`・`save_my_race_review`）が
 * レースのメモと出走馬ぶんの本文を運ぶので、
 * OAuth の口より大きい。日本語は1字3バイト、クライアントが `\uXXXX` で送れば6バイトになる。
 */
export const MCP_BODY_LIMIT = 64 * 1024;

export async function readLimitedText(
	/** 受けた要求か、取りに行った応答（Client ID Metadata Document）。どちらも本文を数えながら読む。 */
	request: Request | Response,
	limit = OAUTH_BODY_LIMIT
): Promise<string | null> {
	const declared = Number(request.headers.get('content-length'));
	if (declared > limit) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder().decode(bytes);
}
