import * as v from 'valibot';

/**
 * MCP クライアントに許すスコープ。**どれも読むだけ。** 書く・共有する・消すスコープはまだ無い。
 *
 * - `races:read` — 全員に共通のマスタ（レース・出走馬・オッズ・馬）。連携するなら必ず許す
 * - `notes:read` — 本人のメモ・見立て・印・札。同意画面で外せる
 *
 * 足すときは、サーバーの tool（`lib/server/mcp/tools.ts`）の `scope` と、同意画面の文言も足す。
 */
export const OAUTH_SCOPES = ['races:read', 'notes:read'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** 同意画面で外せないスコープ。これが無いと tool が1つも呼べない。 */
export const REQUIRED_SCOPES: readonly OAuthScope[] = ['races:read'];

export const SCOPE_LABELS: Record<OAuthScope, string> = {
	'races:read': 'レース・出走馬・オッズ・馬の情報を読む',
	'notes:read': 'あなたのメモ・見立て・印・札を読む'
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
	client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
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
		client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
		code_verifier: pkceString,
		resource: v.optional(v.pipe(v.string(), v.maxLength(2000)))
	}),
	v.object({
		grant_type: v.literal('refresh_token'),
		refresh_token: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
		client_id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
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
