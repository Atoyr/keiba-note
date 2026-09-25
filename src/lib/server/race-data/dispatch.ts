/**
 * 出走馬の取得を GitHub Actions（`.github/workflows/race-data-fetch.yml`）に頼む。
 *
 * **Worker は netkeiba へ行かず、D1 にも書かない。** 出馬表を取って `data/races/*.yaml` に書き、
 * PR を作るのは Actions。本番に入るのは人がその PR をマージしたとき。出走馬データの正は YAML のまま
 * （docs/architecture.md 第0章）。ここがするのは、GitHub の API に「このレースを取って」と1回送ることだけ。
 *
 * トークン（`GITHUB_DISPATCH_TOKEN`）は、このリポジトリの Actions に書き込めるだけの
 * fine-grained token（docs/operations.md）。
 */

export const ENTRIES_WORKFLOW = 'race-data-fetch.yml';

export type EntriesFetchRequest = {
	date: string;
	course: string;
	raceNumber: number;
	/** `race.external_ref`（`nk-202606040911`）。あれば race_id として渡し、レース一覧を引かずに済ませる。 */
	externalRef: string | null;
	/** 枠順が確定していなければ何も書かない（Cron）。 */
	requireConfirmed: boolean;
	/** PR 本文に書く起動元。 */
	trigger: 'cron' | 'admin';
};

/**
 * 頼めなかった理由。**続けるか・通知するかはこの種類だけで決める**（`request.ts`・管理画面）。
 *
 * - `not-configured` … トークンかリポジトリが設定されていない
 * - `auth` … 401 / 403。トークンが無効・期限切れ・権限不足
 * - `rate-limited` … GitHub の API の制限
 * - `network` … 届かなかった・5xx
 * - `http` … それ以外（404 はワークフローが main に無いか、トークンからリポジトリが見えない）
 */
export type DispatchErrorKind = 'not-configured' | 'auth' | 'rate-limited' | 'network' | 'http';

export class DispatchError extends Error {
	override readonly name = 'DispatchError';
	constructor(
		readonly kind: DispatchErrorKind,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
	}
}

export type DispatchConfig = {
	token?: string;
	/** `owner/repo`。 */
	repository?: string;
	fetchFn?: typeof fetch;
};

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

/** 設定がそろっているか。管理画面がボタンを出し分けるのに使う。 */
export function isDispatchConfigured(config: DispatchConfig): boolean {
	return Boolean(config.token) && REPOSITORY.test(config.repository ?? '');
}

/** ワークフローの inputs。値はすべて文字列で送る（workflow_dispatch の約束）。 */
export function workflowInputs(req: EntriesFetchRequest): Record<string, string> {
	const raceId = /^nk-(\d{12})$/.exec(req.externalRef ?? '')?.[1];
	return {
		date: req.date,
		course: req.course,
		race_number: String(req.raceNumber),
		...(raceId ? { race_id: raceId } : {}),
		require_confirmed: String(req.requireConfirmed),
		trigger: req.trigger
	};
}

export async function dispatchEntriesFetch(
	config: DispatchConfig,
	req: EntriesFetchRequest
): Promise<void> {
	const { token, repository } = config;
	if (!token || !repository || !REPOSITORY.test(repository)) {
		throw new DispatchError(
			'not-configured',
			'GITHUB_DISPATCH_TOKEN か GITHUB_REPOSITORY が設定されていません'
		);
	}

	const fetchFn = config.fetchFn ?? fetch;
	const url = `https://api.github.com/repos/${repository}/actions/workflows/${ENTRIES_WORKFLOW}/dispatches`;
	let res: Response;
	try {
		res = await fetchFn(url, {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': 'uma-memo',
				'X-GitHub-Api-Version': '2022-11-28'
			},
			body: JSON.stringify({ ref: 'main', inputs: workflowInputs(req) }),
			signal: AbortSignal.timeout(10_000)
		});
	} catch (e) {
		throw new DispatchError('network', 'GitHub に届きませんでした', { cause: e });
	}
	if (res.ok) return;

	// GitHub は失敗の理由を { message } で返す。トークンは含まれない。
	const detail = (await res.text().catch(() => '')).slice(0, 200);
	const message = `GitHub が ${res.status} を返しました: ${detail}`;
	if (
		res.status === 429 ||
		(res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
	) {
		throw new DispatchError('rate-limited', message);
	}
	if (res.status === 401 || res.status === 403) throw new DispatchError('auth', message);
	if (res.status >= 500) throw new DispatchError('network', message);
	throw new DispatchError('http', message);
}
