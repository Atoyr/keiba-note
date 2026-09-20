/**
 * `?redirect=` に入ってきた値を、安全に飛ばせるパスに正規化する。
 *
 * オープンリダイレクト対策。`/` で始まる相対パスだけを許可し、
 * `//evil.com`（プロトコル相対 URL）と `/\evil.com` を弾く。
 * 許可できないものは `/` に落とす。
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
	if (!target) return fallback;
	if (!target.startsWith('/')) return fallback;
	// `//host` / `/\host` はどちらもブラウザが外部オリジンとして解釈する。
	if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
	return target;
}
