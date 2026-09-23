/**
 * 失敗したレスポンスから「1年そのまま使え」の Cache-Control を外す。
 *
 * adapter-cloudflare は `_headers` で `/_app/immutable/*` に
 * `public, immutable, max-age=31536000` を付ける。これは**見つからなかった 404 にも付く**。
 * デプロイの切り替わりの間に新しい HTML が指すチャンクが 404 で返ると、ブラウザはその 404 を
 * 1年抱え、サーバー側が直ったあとも再読み込みでは取り直さない（画面が JS 無しのまま固まる）。
 *
 * 失敗は取り直せば直るものなので、置いておかせない。入口は `src/worker.js`。
 */
export function uncacheFailure(res: Response): Response {
	if (res.status < 400) return res;
	if (!res.headers.get('cache-control')?.includes('immutable')) return res;

	// ASSETS から来たレスポンスのヘッダは書き換えられないので、作り直す。
	const fixed = new Response(res.body, res);
	fixed.headers.set('cache-control', 'no-store');
	return fixed;
}
