import { and, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { clientMetadataDocumentSchema, isClientIdMetadataUrl } from '$lib/schemas/oauth';
import type { Db } from '$lib/server/db';
import { oauthClient } from '$lib/server/db/schema';
import { readLimitedText } from './limited-body';
import { getClient, UNUSED_CLIENT_TTL_SEC, type OAuthClientView } from './oauth';

/**
 * Client ID Metadata Document（CIMD）。Claude が推奨する方式で、クライアントは自分の情報（名前・戻り先）を
 * 置いた HTTPS の URL を `client_id` として送ってくる。登録（`/oauth/register`）は要らない。
 *
 * **利用者が渡した URL（client_id）へ Worker が取りに行く経路**（docs/architecture.md 第0章・3-10）。守っていること:
 * - 取りに行くのは同意画面（ログインが要る）を開いたときと「許可する」を押したときだけ。誰でも叩ける口からは行かない
 * - URL の形を `isClientIdMetadataUrl` で絞る（https・パスあり・正規化しても変わらない・IP の直書きなし など）
 * - リダイレクトを追わない・5秒で打ち切る・本文は 5 KiB まで・JSON だけ
 * - 文書の `client_id` が URL と完全に一致しなければ使わない（別のクライアントの文書を指させない）
 * - 取れた文書は `oauth_client` に入れて24時間使う。取り直しに失敗したら古い内容は使わない
 * - 一度も連携していない CIMD の行は1,000件まで。取ってから24時間を過ぎたものは、次に取りに行くときに消す
 */

export const CLIENT_METADATA_MAX_BYTES = 5 * 1024;
export const CLIENT_METADATA_TIMEOUT_MS = 5000;
/** 一度も連携していない CIMD の行の上限（動的登録の上限とは別に数える）。 */
export const UNCONNECTED_METADATA_CLIENT_LIMIT = 1000;

export type MetadataFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * 同意画面で使うクライアント。使えないときは理由を分けて返す（同意画面の文を分けるため）。
 * - `unknown` — 登録されていない（動的登録の id が無い・期限切れ）か、CIMD として受けられない URL
 * - `unavailable` — CIMD の文書を取れなかった・中身が合わなかった（相手の一時的な障害もありうる）
 * - `busy` — 一度も連携していない CIMD の行が上限に達している
 */
export type ResolvedClient =
	{ ok: true; client: OAuthClientView } | { ok: false; reason: 'unknown' | 'unavailable' | 'busy' };

type Options = { now?: Date; fetcher?: MetadataFetch; allowLoopback?: boolean };

const sec = (now: Date) => Math.floor(now.getTime() / 1000);

export async function resolveClient(
	db: Db,
	clientId: string,
	{ now = new Date(), fetcher = fetch, allowLoopback = false }: Options = {}
): Promise<ResolvedClient> {
	if (!isClientIdMetadataUrl(clientId, allowLoopback)) {
		const client = await getClient(db, clientId, now);
		return client ? { ok: true, client } : { ok: false, reason: 'unknown' };
	}

	const t = sec(now);
	const cutoff = t - UNUSED_CLIENT_TTL_SEC;
	const [row] = await db
		.select({
			name: oauthClient.name,
			redirectUris: oauthClient.redirectUris,
			source: oauthClient.source,
			fetchedAt: oauthClient.fetchedAt
		})
		.from(oauthClient)
		.where(eq(oauthClient.id, clientId))
		.limit(1);
	// 保存した内容が24時間以内なら、取りに行かずにそれを使う（読むのはこの1回だけ）。
	if (row?.source === 'metadata' && row.fetchedAt !== null && row.fetchedAt > cutoff) {
		return {
			ok: true,
			client: { id: clientId, name: row.name, redirectUris: row.redirectUris, source: 'metadata' }
		};
	}

	const doc = await fetchClientMetadata(clientId, fetcher);
	if (!doc) return { ok: false, reason: 'unavailable' };

	const unconnectedMetadata = and(
		eq(oauthClient.source, 'metadata'),
		isNull(oauthClient.connectedAt)
	);
	// 取ってから24時間を過ぎた未連携の CIMD の行を、最大100件ずつ消す（今の行は消さない）。
	const stale = db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(
			and(unconnectedMetadata, lte(oauthClient.fetchedAt, cutoff), ne(oauthClient.id, clientId))
		)
		.limit(100);
	const pending = db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(unconnectedMetadata)
		.limit(UNCONNECTED_METADATA_CLIENT_LIMIT);
	const uris = JSON.stringify(doc.redirectUris);
	const [, saved] = await db.batch([
		db.delete(oauthClient).where(inArray(oauthClient.id, stale)),
		row
			? // 既にある行（連携済みを含む）は数の上限によらず取り直した内容にする。
				db
					.update(oauthClient)
					.set({ name: doc.name, redirectUris: doc.redirectUris, source: 'metadata', fetchedAt: t })
					.where(eq(oauthClient.id, clientId))
					.returning({ id: oauthClient.id })
			: db
					.insert(oauthClient)
					.select(
						// 列は schema.ts の oauthClient の並び（id・name・redirect_uris・connected_at・source・fetched_at・created_at）。
						sql`SELECT ${clientId}, ${doc.name}, ${uris}, NULL, 'metadata', ${t}, ${t}
						WHERE (SELECT count(*) FROM (${pending})) < ${UNCONNECTED_METADATA_CLIENT_LIMIT}`
					)
					.returning({ id: oauthClient.id })
	]);
	if (saved.length === 0) return { ok: false, reason: 'busy' };
	return {
		ok: true,
		client: { id: clientId, name: doc.name, redirectUris: doc.redirectUris, source: 'metadata' }
	};
}

/** 文書を取って確かめる。どこかで合わなければ null。 */
export async function fetchClientMetadata(
	url: string,
	fetcher: MetadataFetch
): Promise<{ name: string; redirectUris: string[] } | null> {
	let res: Response;
	try {
		res = await fetcher(url, {
			method: 'GET',
			headers: { accept: 'application/json' },
			// 別の場所へ回されても追わない（確かめた URL と違う所の文書を読まない）。
			redirect: 'manual',
			signal: AbortSignal.timeout(CLIENT_METADATA_TIMEOUT_MS)
		});
	} catch {
		return null;
	}
	if (res.status !== 200) {
		await res.body?.cancel();
		return null;
	}
	if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
		await res.body?.cancel();
		return null;
	}
	const text = await readLimitedText(res, CLIENT_METADATA_MAX_BYTES).catch(() => null);
	if (text === null) return null;
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return null;
	}
	const parsed = v.safeParse(clientMetadataDocumentSchema, json);
	if (!parsed.success || parsed.output.client_id !== url) return null;
	return {
		name: parsed.output.client_name || new URL(url).host,
		redirectUris: parsed.output.redirect_uris
	};
}
