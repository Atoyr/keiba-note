/**
 * すべての応答に付ける共通のセキュリティヘッダ（多層防御）。SvelteKit を import しない純関数。
 *
 * **既にある項目は上書きしない。** 共有ページの `Referrer-Policy: no-referrer` と、
 * 同意画面の `same-origin`・`frame-ancestors` はそれぞれの理由で決めた値なので残す。
 *
 * `script-src` は入れない。`app.html` のインライン script に nonce が要るため（別の作業）。
 * HSTS は `includeSubDomains`・`preload` を付けない（取り消しにくい）。https のときだけ付ける。
 *
 * 付かない口: `/oauth/token` と `DELETE /mcp` の 405（src/worker.js が SvelteKit より先に受ける）、
 * SvelteKit の CSRF の検査の 403（hooks より前に返る）、静的アセット
 * （Worker が起動しない）、handle の中で `redirect()` を投げた応答（未ログインのリダイレクト。中身が無い）、
 * handle の中で投げた例外の 500（SvelteKit が handle の外で組む。try/catch で握ると `redirect()` まで握ってしまうので包まない）。
 */
export function applySecurityHeaders(headers: Headers, url: URL): void {
	const defaults: [string, string][] = [
		['X-Content-Type-Options', 'nosniff'],
		['X-Frame-Options', 'DENY'],
		['Content-Security-Policy', "frame-ancestors 'none'"],
		['Referrer-Policy', 'strict-origin-when-cross-origin'],
		['Permissions-Policy', 'camera=(), microphone=(), geolocation=()']
	];
	if (url.protocol === 'https:') {
		defaults.push(['Strict-Transport-Security', 'max-age=31536000']);
	}
	for (const [name, value] of defaults) {
		if (!headers.has(name)) headers.set(name, value);
	}
	// CSP が既にあっても `frame-ancestors` を含まなければ足す（含んでいれば触らない）。
	const csp = headers.get('Content-Security-Policy');
	if (csp !== null && !/(^|;)\s*frame-ancestors\b/i.test(csp)) {
		headers.set('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
	}
}
