import { SvelteMap, SvelteSet } from 'svelte/reactivity';

export type QuickStatus = 'saving' | 'saved' | 'error';

/**
 * クイック入力の自動保存の送信を、馬ごとに1本にまとめる（最後の入力が勝つ）。
 *
 * - 送信中に同じ馬へ `save` が来たら、最新の本文だけを控える。応答が来てから、控えを続けて送る
 * - 応答の値を欄へ書き戻すことはしない（古い応答で巻き戻らない）。成功したら**送った本文**を `onSaved` に渡す
 * - 失敗しても控えがあれば続けて送る（新しい値で上書きされるので、再試行を兼ねる）。控えが無ければ `error`
 * - 別の馬は並行して送ってよい
 * - 状態の表示（`status`）は `reset` で空に戻せる。送信中のものは結果を待つが、`reset` 以降は表示にも `onSaved` にも反映しない
 *
 * 送り方（`send`）は呼び出し側が持つ。成功したときだけ true を返す。
 */
export class QuickSaver {
	#send: (entryId: string, body: string) => Promise<boolean>;
	#onSaved: (entryId: string, body: string) => void;
	#inflight = new SvelteSet<string>();
	#pending = new SvelteMap<string, string>();
	#last = new SvelteMap<string, string>();
	#generation = 0;

	/** 出走馬の id → 状態。 */
	status = $state<Record<string, QuickStatus>>({});

	/** どれかが送信中か。 */
	readonly busy = $derived(Object.values(this.status).includes('saving'));
	/** 保存できなかった馬の頭数。 */
	readonly failed = $derived(Object.values(this.status).filter((s) => s === 'error').length);

	constructor(options: {
		send: (entryId: string, body: string) => Promise<boolean>;
		onSaved: (entryId: string, body: string) => void;
	}) {
		this.#send = options.send;
		this.#onSaved = options.onSaved;
	}

	/** その馬の本文を保存する。送信中なら最新の本文だけを控える。 */
	save(entryId: string, body: string) {
		this.#last.set(entryId, body);
		this.status[entryId] = 'saving';
		if (this.#inflight.has(entryId)) {
			this.#pending.set(entryId, body);
			return;
		}
		void this.#run(entryId, body);
	}

	/** 失敗した馬（省略なら全頭）を、持っている最後の本文で送り直す。 */
	retry(entryId?: string) {
		const ids = entryId
			? [entryId]
			: Object.keys(this.status).filter((id) => this.status[id] === 'error');
		for (const id of ids) {
			if (this.status[id] !== 'error') continue;
			const body = this.#last.get(id);
			if (body !== undefined) this.save(id, body);
		}
	}

	/** 状態の表示を空に戻す（別のレースへ移ったとき・一括保存が通ったとき）。 */
	reset() {
		this.#generation++;
		this.status = {};
		this.#pending.clear();
		this.#last.clear();
	}

	async #run(entryId: string, body: string): Promise<void> {
		const generation = this.#generation;
		this.#inflight.add(entryId);
		const ok = await this.#send(entryId, body).catch(() => false);
		this.#inflight.delete(entryId);
		const current = generation === this.#generation;
		if (ok && current) this.#onSaved(entryId, body);

		const next = this.#pending.get(entryId);
		if (next !== undefined) {
			this.#pending.delete(entryId);
			void this.#run(entryId, next);
			return;
		}
		if (current) this.status[entryId] = ok ? 'saved' : 'error';
	}
}
