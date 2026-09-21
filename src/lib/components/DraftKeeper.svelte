<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 一括保存フォームの「書き忘れ」と「書いたものが消える」を防ぐ。
	 *
	 * この2つは別の問題で、原因も対策も違う。
	 *
	 * | 問題 | 原因 | ここで効かせるもの |
	 * | --- | --- | --- |
	 * | 書き忘れ | 保存していないことに気づけない | 未保存の件数表示 + 離脱時の確認 |
	 * | 書いたものが消える | 離脱・リロード・**電波が悪くて保存が失敗** | localStorage の下書き |
	 *
	 * **保存の単位は変えない。** 1頭ごとにサーバーへ送る案もあるが、競馬場で電波が
	 * 悪いと18回のうち何回かが黙って失敗し、どれが落ちたか分からなくなる。
	 * 一括なら「1回成功したか」だけ見れば済む。オフラインで守れるのは端末内の下書きだけ。
	 *
	 * **復元は明示操作にする。** 自動で流し込むと、このフォームの
	 * 「空欄＝そのメモを消す」仕様と噛み合って、既存メモが黙って消える事故になる。
	 * 下書きに入れるのも**サーバーの値から変えた項目だけ**なので、
	 * 触っていない馬のメモを空で上書きすることがない。
	 */
	let {
		form,
		storageKey
	}: {
		/** 監視する form 要素。親から bind:this で渡す。 */
		form: HTMLFormElement | null;
		/** localStorage のキー。レースとユーザーで分ける。 */
		storageKey: string;
	} = $props();

	type Draft = { savedAt: number; fields: Record<string, string> };

	/** 保存済み（＝サーバーから来た）状態。これとの差分が「未保存」。 */
	let initial: Record<string, string> = {};
	let dirtyCount = $state(0);
	/** 復元できる下書き。null なら出さない。 */
	let restorable = $state<Draft | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * フォームの現在値。ラジオは選択中のものだけ、チェックボックスは入れない。
	 * FormData を使うのは、name の付いた入力を漏れなく拾うため。
	 */
	function readValues(el: HTMLFormElement): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [k, v] of new FormData(el)) {
			if (typeof v === 'string') out[k] = v;
		}
		return out;
	}

	function changedFields(el: HTMLFormElement): Record<string, string> {
		const now = readValues(el);
		const diff: Record<string, string> = {};
		for (const k of new Set([...Object.keys(now), ...Object.keys(initial)])) {
			const a = now[k] ?? '';
			const b = initial[k] ?? '';
			if (a !== b) diff[k] = a;
		}
		return diff;
	}

	/** localStorage は private モードや設定次第で投げる。ここで握り潰す。 */
	function readDraft(): Draft | null {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Draft;
			return parsed && typeof parsed === 'object' && parsed.fields ? parsed : null;
		} catch {
			return null;
		}
	}

	function writeDraft(fields: Record<string, string>) {
		try {
			if (Object.keys(fields).length === 0) localStorage.removeItem(storageKey);
			else localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), fields }));
		} catch {
			// 保存できなくても入力は続けられる。下書きは保険であって本体ではない。
		}
	}

	/** 保存が通ったら呼ぶ。下書きを捨て、いまの値を新しい「保存済み」にする。 */
	export function clear() {
		try {
			localStorage.removeItem(storageKey);
		} catch {
			/* 握り潰す */
		}
		restorable = null;
		if (form) initial = readValues(form);
		dirtyCount = 0;
	}

	function onInput() {
		if (!form) return;
		const diff = changedFields(form);
		dirtyCount = Object.keys(diff).length;

		if (timer) clearTimeout(timer);
		timer = setTimeout(() => writeDraft(diff), 400);
	}

	function restore() {
		if (!form || !restorable) return;
		for (const [name, value] of Object.entries(restorable.fields)) {
			const fields = form.elements.namedItem(name);
			if (!fields) continue;

			if (fields instanceof RadioNodeList) {
				for (const node of fields) {
					if (node instanceof HTMLInputElement) node.checked = node.value === value;
				}
			} else if (fields instanceof HTMLInputElement || fields instanceof HTMLTextAreaElement) {
				fields.value = value;
			} else if (fields instanceof HTMLSelectElement) {
				fields.value = value;
			}
		}
		restorable = null;
		onInput();
	}

	function discard() {
		restorable = null;
		writeDraft({});
	}

	$effect(() => {
		const el = form;
		if (!el) return;

		initial = readValues(el);

		// 下書きが残っていて、いまのフォームと違うなら復元を持ちかける。
		// 同じなら（＝保存済み）黙って捨てる。
		const draft = readDraft();
		if (draft) {
			const now = readValues(el);
			const differs = Object.entries(draft.fields).some(([k, v]) => (now[k] ?? '') !== v);
			if (differs) restorable = draft;
			else writeDraft({});
		}

		el.addEventListener('input', onInput);
		el.addEventListener('change', onInput);
		return () => {
			el.removeEventListener('input', onInput);
			el.removeEventListener('change', onInput);
			if (timer) clearTimeout(timer);
		};
	});

	/** 未保存のまま閉じようとしたら止める。ブラウザ既定の確認が出る。 */
	$effect(() => {
		if (dirtyCount === 0) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
		addEventListener('beforeunload', onBeforeUnload);
		return () => removeEventListener('beforeunload', onBeforeUnload);
	});

	const when = $derived(
		restorable
			? new Date(restorable.savedAt).toLocaleString('ja-JP', {
					timeZone: 'Asia/Tokyo',
					month: 'numeric',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: ''
	);
</script>

{#if restorable}
	<div
		class="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
	>
		<span>保存されていない下書きがあります（{when}）。</span>
		<span class="flex-1"></span>
		<Button type="button" size="sm" variant="secondary" onclick={restore}>復元する</Button>
		<Button type="button" size="sm" variant="ghost" onclick={discard}>破棄</Button>
	</div>
{/if}

{#if dirtyCount > 0}
	<p class="mb-1 text-xs text-amber-700" aria-live="polite">
		未保存の変更が {dirtyCount} 件あります
	</p>
{/if}
