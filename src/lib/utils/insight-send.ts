import { deserialize } from '$app/forms';
import { InsightSendError, type InsightOp, type InsightValue } from './insight-saver.svelte';

/**
 * 気づきの自動保存のための、form action の `fetch` 呼び出し。
 *
 * 画面側に専用の API は作らない（frontend.md 第1章）が、押すたびに画面全体を描き直さず、
 * 1 操作 1 リクエストで送るには `fetch` が要る。`x-sveltekit-action` を付けた POST は、
 * SvelteKit が action の結果を JSON で返す（`use:enhance` と同じ経路）。送り先は同じ action なので、
 * JS が無いときのフォーム送信と検証・認可が同じになる。
 *
 * `success` の data を返し、それ以外（`failure`・`redirect`・`error`・ネットワーク）は throw する。
 * 失敗の文は `failure` の `message` を載せる。
 */
export async function sendInsight(
	action: string,
	body: FormData,
	opts: { keepalive?: boolean } = {}
): Promise<InsightValue & { entryId: string }> {
	const res = await fetch(action, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true', accept: 'application/json' },
		keepalive: opts.keepalive
	});
	// セッションが切れていると /login へリダイレクトされ、応答は HTML になる。ネットワークの失敗と区別する。
	if (res.redirected && new URL(res.url).pathname === '/login') {
		throw new InsightSendError('', true);
	}
	const result = deserialize(await res.text());
	if (result.type === 'success') {
		return result.data as unknown as InsightValue & { entryId: string };
	}
	const message =
		result.type === 'failure' && typeof result.data?.message === 'string'
			? result.data.message
			: '';
	throw new InsightSendError(message);
}

/** `InsightOp` を action の入力（FormData）にする。 */
export function insightFormData(op: InsightOp): FormData {
	const fd = new FormData();
	if (op.kind === 'word') {
		fd.set('toggle', JSON.stringify({ entryId: op.entryId, word: op.word, on: op.on }));
	} else {
		fd.set('saveMemo', op.entryId);
		fd.set(`insightMemo.${op.entryId}`, op.memo);
	}
	return fd;
}
