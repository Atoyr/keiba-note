/**
 * 解析で同一オリジンかを確かめるための仮のオリジン。実在しない（`.invalid`）ので、
 * 入力がこれ以外のオリジンに解決されたら外へ出る値だと分かる。
 */
const BASE = 'http://safe-redirect.invalid';

/**
 * `?redirect=` に入ってきた値を、安全に飛ばせるパスに正規化する。
 *
 * オープンリダイレクト対策。前方一致の継ぎ足しではなく、URL として解析して判定する。
 * WHATWG URL の解析はタブ・改行を取り除くので、`/<TAB>/evil.com` は `//evil.com` になる。
 * そのため制御文字（`\u0000-\u001f`・`\u007f`）と `\` は位置を問わず弾き、
 * 解析したうえでオリジンが変わるものも弾く。許可できないものは `fallback` に落とす。
 *
 * 返すのは正規化後のパス（日本語は百分率符号化になり、符号化済みのものは変わらない）。
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
	// eslint-disable-next-line no-control-regex -- 制御文字を弾くのが目的
	if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;

	let url: URL;
	try {
		url = new URL(target, BASE);
	} catch {
		return fallback;
	}
	if (url.origin !== BASE) return fallback;
	// `/..//evil.com` は解析で `//evil.com` に畳まれる。畳んだ結果がプロトコル相対になるものも弾く。
	const out = url.pathname + url.search + url.hash;
	if (out.startsWith('//')) return fallback;
	return out;
}
