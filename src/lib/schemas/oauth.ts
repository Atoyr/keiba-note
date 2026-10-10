import * as v from 'valibot';

/**
 * MCP クライアントに許すスコープ。共有する・消すスコープは無い。
 *
 * - `races:read` — 全員に共通のマスタ（レース・出走馬・オッズ・馬）。連携するなら必ず許す
 * - `notes:read` — 本人のメモ・見立て・印・札。同意画面で外せる
 * - `notes:write` — 本人の予想（見立て・印・札・出走前メモ）を書く。同意画面で外せる。
 *   ふりかえりは `reviews:write`。近況メモ・展開・共有には触れない（architecture.md 3-10）
 * - `reviews:write` — 本人のふりかえり（レースのメモ・各馬のメモと札）を書く。同意画面で外せる。
 *   開催日以降（当日を含む）のレースにだけ書ける。予想・近況メモ・共有には触れない
 *
 * 足すときは、サーバーの tool（`lib/server/mcp/tools.ts`）の `scope` と、同意画面の文言も足す。
 */
export const OAUTH_SCOPES = ['races:read', 'notes:read', 'notes:write', 'reviews:write'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** 同意画面で外せないスコープ。これが無いと tool が1つも呼べない。 */
export const REQUIRED_SCOPES: readonly OAuthScope[] = ['races:read'];

export const SCOPE_LABELS: Record<OAuthScope, string> = {
	'races:read': 'レース・出走馬・オッズ・馬の情報を読む',
	'notes:read': 'あなたのメモ・見立て・印・札を読む',
	'notes:write': 'あなたの予想（見立て・印・札・出走前メモ）を書く',
	'reviews:write': 'あなたのふりかえり（レースのメモ・各馬のメモと札）を書く'
};

const isScope = (s: string): s is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(s);

/** スコープを決まった順にそろえ、重複を落とす。 */
export function sortScopes(scopes: Iterable<string>): OAuthScope[] {
	const set = new Set(scopes);
	return OAUTH_SCOPES.filter((s) => set.has(s));
}

/**
 * 要求された `scope`（空白区切り）を読む。**知らないスコープは捨てる**（クライアントが `openid` などを
 * 付けてくることがあり、それで連携ごと断ると使えない）。知っているものが1つも無ければ全部を求めたとみなす。
 * 外せないスコープは必ず含める。
 */
export function requestedScopes(scope: string | null | undefined): OAuthScope[] {
	const known = (scope ?? '').split(/\s+/).filter(isScope);
	return sortScopes([...REQUIRED_SCOPES, ...(known.length > 0 ? known : OAUTH_SCOPES)]);
}

/**
 * 同意のときに許すスコープ。求められたもののうち本人がチェックを残したものと、外せないもの。
 * **求められていないスコープは、チェックの値に足して送られても許さない。**
 */
export function grantedScopes(
	requested: readonly OAuthScope[],
	checked: readonly string[]
): OAuthScope[] {
	return sortScopes([...REQUIRED_SCOPES, ...requested.filter((s) => checked.includes(s))]);
}

/** 同意のフォームの、本人の操作の部分。押されたボタンとチェックを残したスコープ。 */
export const consentSchema = v.object({
	decision: v.picklist(['allow', 'deny']),
	scope_grant: v.array(v.pipe(v.string(), v.maxLength(100)))
});

/** 文字列（DB の JSON から読んだものなど）のうち、今あるスコープだけを残す。 */
export function knownScopes(scopes: readonly string[]): OAuthScope[] {
	return sortScopes(scopes.filter(isScope));
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * 登録してよい戻り先。`https:` か、手元のアプリが受けるループバックの `http:`（RFC 8252）だけ。
 * フラグメント付きは OAuth で禁じられている。
 */
export function isAllowedRedirectUri(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.hash || url.username || url.password) return false;
	if (url.protocol === 'https:') return true;
	return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * 認可の要求に来た戻り先が、登録したどれかと一致するか。**文字列の完全一致。**
 * ループバックだけはポートを問わない（手元のアプリは空いているポートで受けるため。RFC 8252 7.3）。
 */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
	if (registered.includes(requested)) return true;
	let req: URL;
	try {
		req = new URL(requested);
	} catch {
		return false;
	}
	if (req.protocol !== 'http:' || !LOOPBACK_HOSTS.has(req.hostname)) return false;
	return registered.some((r) => {
		const reg = new URL(r);
		return (
			reg.protocol === 'http:' &&
			reg.hostname === req.hostname &&
			reg.pathname === req.pathname &&
			reg.search === req.search
		);
	});
}

/** `client_id` の長さの上限。Client ID Metadata Document では URL そのものが client_id になる。 */
export const CLIENT_ID_MAX = 2000;

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/**
 * Client ID Metadata Document（CIMD。MCP 2025-11-25 の認可・draft-ietf-oauth-client-id-metadata-document）の
 * `client_id` として受けてよい URL か。Claude はこの方式を推奨している。
 *
 * - `https:` で、パスがある（ホストだけの URL は受けない）
 * - フラグメント・ユーザー名とパスワード・クエリを持たず、`.` と `..` のセグメントを持たない。正規化しても変わらない
 * - ホストが IP アドレスの直書き・`localhost`・末尾のドット付きでない。名前で私的なアドレスを指すものまでは
 *   形では弾けないので、Workers の fetch が私的なネットワークへ届かないことに頼っている
 *
 * `allowLoopback` は E2E だけで使う（手元のサーバーが置いた文書を `http://localhost` で読む）。
 * 本番では設定しない（wrangler.toml に無く、playwright.config.ts の `--var` だけが付ける）。
 */
export function isClientIdMetadataUrl(clientId: string, allowLoopback = false): boolean {
	if (clientId.length > CLIENT_ID_MAX) return false;
	let url: URL;
	try {
		url = new URL(clientId);
	} catch {
		return false;
	}
	// URL は `..` を勝手に畳むので、元の文字列で確かめる。
	const rawPath = clientId.replace(/^[a-z]+:\/\/[^/]*/i, '');
	if (rawPath.split('/').some((seg) => seg === '.' || seg === '..')) return false;
	if (url.hash || url.search || clientId.includes('#') || clientId.includes('?')) return false;
	if (url.username || url.password) return false;
	if (url.pathname === '/' || url.pathname === '') return false;
	// 正規化しても変わらない URL だけ。`%2e%2e`・`\`・`:443`・大文字のホストなどで、取りに行く先と
	// 文書の client_id を比べる文字列がずれないように（fetch は正規化したあとの URL へ行く）。
	if (url.href !== clientId) return false;
	if (url.protocol === 'http:') return allowLoopback && url.hostname === 'localhost';
	if (url.protocol !== 'https:') return false;
	const host = url.hostname;
	if (host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost')) return false;
	return !IP_LITERAL.test(host) && host.includes('.');
}

/**
 * Client ID Metadata Document の中身。ほかの項目（logo_uri など）は読み捨てる。
 * 公開クライアント（`none`）として使えるものだけを受ける。条件と理由は architecture.md 3-10。
 */
export const clientMetadataDocumentSchema = v.pipe(
	v.object({
		client_id: v.pipe(v.string(), v.maxLength(CLIENT_ID_MAX)),
		client_name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
		redirect_uris: v.pipe(
			v.array(v.pipe(v.string(), v.maxLength(2000))),
			v.minLength(1),
			v.maxLength(10),
			v.check((uris) => uris.every(isAllowedRedirectUri), '戻り先は https かループバックだけです')
		),
		token_endpoint_auth_method: v.optional(v.unknown()),
		// 判定にしか使わないので形は問わない（崩れていても none 以外の方式を受けないだけ）。
		token_endpoint_auth_methods_supported: v.optional(v.unknown())
	}),
	v.check(
		(doc) =>
			doc.token_endpoint_auth_method === undefined ||
			doc.token_endpoint_auth_method === 'none' ||
			(Array.isArray(doc.token_endpoint_auth_methods_supported) &&
				doc.token_endpoint_auth_methods_supported.includes('none')),
		'公開クライアント（none）として使えるものだけを受けます'
	),
	v.transform(({ client_id, client_name, redirect_uris }) => ({
		client_id,
		client_name,
		redirect_uris
	}))
);

/** 動的クライアント登録（RFC 7591）。ほかの項目（logo_uri など）は読み捨てる。 */
export const clientRegistrationSchema = v.object({
	client_name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
	redirect_uris: v.pipe(
		v.array(v.pipe(v.string(), v.maxLength(2000))),
		v.minLength(1, '戻り先（redirect_uris）がありません'),
		v.maxLength(5, '戻り先は5つまでです'),
		v.check((uris) => uris.every(isAllowedRedirectUri), '戻り先は https かループバックだけです')
	),
	// 公開クライアントだけを受ける（秘密鍵を配らない。PKCE で守る）。
	token_endpoint_auth_method: v.optional(
		v.literal('none', '公開クライアント（none）だけを受けます')
	),
	grant_types: v.optional(v.array(v.picklist(['authorization_code', 'refresh_token']))),
	response_types: v.optional(v.array(v.literal('code')))
});

/** PKCE の code_verifier と code_challenge（S256 なら43文字）。RFC 7636 の文字だけ。 */
const pkceString = v.pipe(v.string(), v.regex(/^[A-Za-z0-9\-._~]{43,128}$/));

/** 認可の要求（`/oauth/authorize` の GET と、同意のフォームの hidden）。 */
export const authorizeRequestSchema = v.object({
	response_type: v.literal('code'),
	client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(CLIENT_ID_MAX)),
	redirect_uri: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
	code_challenge: pkceString,
	// OAuth 2.1 は plain を禁じる。S256 だけ。
	code_challenge_method: v.literal('S256'),
	state: v.optional(v.pipe(v.string(), v.maxLength(2000))),
	scope: v.optional(v.pipe(v.string(), v.maxLength(500))),
	resource: v.optional(v.pipe(v.string(), v.maxLength(2000)))
});
export type AuthorizeRequest = v.InferOutput<typeof authorizeRequestSchema>;

/** トークンの要求（`/oauth/token`）。 */
export const tokenRequestSchema = v.variant('grant_type', [
	v.object({
		grant_type: v.literal('authorization_code'),
		code: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
		redirect_uri: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
		client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(CLIENT_ID_MAX)),
		code_verifier: pkceString,
		resource: v.optional(v.pipe(v.string(), v.maxLength(2000)))
	}),
	v.object({
		grant_type: v.literal('refresh_token'),
		refresh_token: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
		client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(CLIENT_ID_MAX)),
		scope: v.optional(v.pipe(v.string(), v.maxLength(500))),
		resource: v.optional(v.pipe(v.string(), v.maxLength(2000)))
	})
]);
export type TokenRequest = v.InferOutput<typeof tokenRequestSchema>;

/**
 * `resource`（RFC 8707）が自分の MCP を指しているか。無ければ通す（古いクライアントは送らない）。
 * 別のサーバー向けのトークンを出さないための確認。
 */
export function isOwnResource(resource: string | undefined, origin: string): boolean {
	if (resource === undefined) return true;
	return [`${origin}/mcp`, `${origin}/mcp/`, origin, `${origin}/`].includes(resource);
}
