export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual' | 'retry';

/** 保存成功後、余分な通信を挟まず呼ぶ。端末の共有画面にはユーザー操作直後の呼び出しが必要。 */
export async function shareLink(data: { title: string; url: string }): Promise<ShareOutcome> {
	if (typeof navigator.share === 'function') {
		try {
			await navigator.share(data);
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
			// 回線が遅くユーザー操作の有効期間が切れた場合などは、発行済みリンクで再試行できる。
			return 'retry';
		}
	}
	try {
		await navigator.clipboard.writeText(data.url);
		return 'copied';
	} catch {
		return 'manual';
	}
}
