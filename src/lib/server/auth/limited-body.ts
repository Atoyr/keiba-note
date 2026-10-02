/**
 * ログイン無しで誰でも叩ける OAuth の口（トークン・クライアント登録）で、本文を上限つきで読む。
 *
 * `request.text()` は大きさを問わず全部を読む。Workers に届く本文は最大 100MB で、isolate のメモリを
 * 食い潰す要求をいくらでも送れてしまう。`Content-Length` は偽れるので、読みながら数えて止める。
 * 上限を超えたら null。
 */
export const OAUTH_BODY_LIMIT = 8 * 1024;

export async function readLimitedText(
	request: Request,
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
