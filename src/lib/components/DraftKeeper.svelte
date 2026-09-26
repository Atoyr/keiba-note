<script lang="ts">
	import { tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
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
	 *
	 * 未保存の件数は `dirtyCount` で親へ返し、`SaveBar` が保存ボタンと一緒に出す。
	 */
	let {
		form,
		storageKey,
		dirtyCount = $bindable(0)
	}: {
		/** 監視する form 要素。親から bind:this で渡す。 */
		form: HTMLFormElement | null;
		/** localStorage のキー。レースとユーザーで分ける。 */
		storageKey: string;
		/** 未保存の変更の件数。親は `bind:dirtyCount` で受ける。 */
		dirtyCount?: number;
	} = $props();

	type Draft = { savedAt: number; fields: Record<string, string[]> };

	/** 保存済み（＝サーバーから来た）状態。これとの差分が「未保存」。 */
	let initial: Record<string, string[]> = {};
	/** 復元できる下書き。null なら出さない。 */
	let restorable = $state<Draft | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * フォームの現在値。FormData を使うのは、name の付いた入力を漏れなく拾うため。
	 *
	 * **値は配列で持つ。** 札（`TagPicker`）が同じ name のチェックボックスを
	 * 並べるので、1つの name に複数の値が乗る。文字列1つで持っていた頃は
	 * 最後にチェックしたものだけが下書きに残り、復元すると他が外れていた。
	 * ラジオは選択中のもの、チェックボックスはオンのものだけが乗る。
	 */
	function readValues(el: HTMLFormElement): Record<string, string[]> {
		const out: Record<string, string[]> = {};
		for (const [k, v] of new FormData(el)) {
			if (typeof v !== 'string') continue;
			(out[k] ??= []).push(v);
		}
		return out;
	}

	/**
	 * 同じ値かどうか。JSON にして比べる。
	 *
	 * 区切り文字で連結して比べる手もあるが、本文（textarea）には何でも入るので
	 * 安全な区切りが無い。並び順は DOM の順で安定しているので JSON で足りる。
	 */
	const same = (a: string[] | undefined, b: string[] | undefined) =>
		JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

	function changedFields(el: HTMLFormElement): Record<string, string[]> {
		const now = readValues(el);
		const diff: Record<string, string[]> = {};
		for (const k of new Set([...Object.keys(now), ...Object.keys(initial)])) {
			if (!same(now[k], initial[k])) diff[k] = now[k] ?? [];
		}
		return diff;
	}

	/**
	 * localStorage は private モードや設定次第で投げる。ここで握り潰す。
	 *
	 * **値が文字列で入っている古い下書きも受ける。** 札を入れる前は
	 * `Record<string, string>` で書いていたので、端末に残っているものがある。
	 */
	function readDraft(): Draft | null {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as { savedAt?: number; fields?: Record<string, unknown> };
			if (!parsed || typeof parsed !== 'object' || !parsed.fields) return null;

			const fields: Record<string, string[]> = {};
			for (const [k, value] of Object.entries(parsed.fields)) {
				if (typeof value === 'string') fields[k] = value === '' ? [] : [value];
				else if (Array.isArray(value))
					fields[k] = value.filter((x): x is string => typeof x === 'string');
			}
			return { savedAt: parsed.savedAt ?? 0, fields };
		} catch {
			return null;
		}
	}

	function writeDraft(fields: Record<string, string[]>) {
		try {
			if (Object.keys(fields).length === 0) localStorage.removeItem(storageKey);
			else localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), fields }));
		} catch {
			// 保存できなくても入力は続けられる。下書きは保険であって本体ではない。
		}
	}

	/** 送る直前と、応答を画面に反映する直前に呼ぶ。いまの値を返す。 */
	export function snapshot(): Record<string, string[]> | null {
		return form ? readValues(form) : null;
	}

	/**
	 * 保存が通って、`update()` で画面を描き直したあとに呼ぶ。送った値（`sent`）を新しい
	 * 「保存済み」にし、下書きを捨てる。
	 *
	 * **いまの値ではなく、送った値を保存済みにする。** 送信中に書き足した分はサーバーに
	 * 届いていないので、未保存のまま数え、下書きにも残す。いまの値を読むと、それが
	 * 保存済みに数えられ、保存ボタンも離れるときの確認も消える。
	 *
	 * **送信中に書き足した分は、フォームへ書き戻す**（`late` は `update()` の直前の値）。
	 * `update()` で data が送った値に変わると、その欄が送った値で描き直され、
	 * 書き足した分が画面から消えるため。
	 */
	export async function clear(
		sent?: Record<string, string[]> | null,
		late?: Record<string, string[]> | null
	) {
		restorable = null;
		if (timer) clearTimeout(timer);
		if (!form) {
			dirtyCount = 0;
			writeDraft({});
			return;
		}
		initial = sent ?? readValues(form);
		if (late) {
			await tick();
			const back: Record<string, string[]> = {};
			for (const k of new Set([...Object.keys(late), ...Object.keys(initial)])) {
				if (!same(late[k], initial[k])) back[k] = late[k] ?? [];
			}
			applyFields(back);
		}
		const diff = changedFields(form);
		dirtyCount = Object.keys(diff).length;
		writeDraft(diff);
	}

	/**
	 * name ごとの値をフォームへ入れる。復元と、送信中に書き足した分の書き戻しで使う。
	 *
	 * 値が変わった欄には**泡立たない `change`** を投げる。値をプログラムで変えてもイベントは起きないので、
	 * 欄の値から自分の表示を組む部品（展開の盤面 `RaceFlowEditor` の hidden の欄）が
	 * 書き戻しに気づけない。泡立たないので、フォームで聞いている `onInput` には届かない
	 * （件数はこのあと呼び出し側が数え直す）。
	 *
	 * **投げ方はブラウザに合わせる。** 値が変わらなかった欄には投げない。ラジオは新しく選ばれたものにだけ
	 * 投げる（外れたほうには起きない。Svelte の bind:group は change で checked を見ずに値を入れる）。
	 */
	function applyFields(values: Record<string, string[]>) {
		if (!form) return;
		const notify = (el: EventTarget) => el.dispatchEvent(new Event('change'));
		const check = (node: HTMLInputElement, on: boolean) => {
			if (node.checked === on) return;
			node.checked = on;
			if (node.type !== 'radio' || on) notify(node);
		};
		for (const [name, picked] of Object.entries(values)) {
			const fields = form.elements.namedItem(name);
			if (!fields) continue;

			// 同じ name が複数あると RadioNodeList で来る。ラジオでも札の
			// チェックボックス群でも、下書きに入っている値だけを on にすればよい。
			if (fields instanceof RadioNodeList) {
				for (const node of fields) {
					if (node instanceof HTMLInputElement) check(node, picked.includes(node.value));
				}
			} else if (fields instanceof HTMLInputElement) {
				if (fields.type === 'checkbox' || fields.type === 'radio') {
					check(fields, picked.includes(fields.value));
				} else if (fields.value !== (picked[0] ?? '')) {
					fields.value = picked[0] ?? '';
					notify(fields);
				}
			} else if (fields instanceof HTMLTextAreaElement || fields instanceof HTMLSelectElement) {
				if (fields.value !== (picked[0] ?? '')) {
					fields.value = picked[0] ?? '';
					notify(fields);
				}
			}
		}
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
		applyFields(restorable.fields);
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
			const differs = Object.entries(draft.fields).some(([k, v]) => !same(now[k], v));
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

	/**
	 * アプリ内のリンク（ヘッダー・馬名・戻る）で離れるときも止める。
	 *
	 * **`beforeunload` だけでは足りない。** SvelteKit のリンクはページを読み込み直さずに
	 * 画面を差し替えるので、`beforeunload` が起きない。止めずに行かせると、
	 * 書きかけは下書きに残るものの、保存していないことに気づかないまま離れる。
	 *
	 * - `leave`（タブを閉じる・外のサイトへ行く）は上の `beforeunload` が受け持つ
	 * - 同じページの中のアンカー（付けた印から馬の行へ飛ぶ）は離脱ではないので止めない
	 * - 行くと決めたら、下書きを待たずにすぐ書く（入力から 400ms 以内だとまだ書いていない）
	 */
	beforeNavigate((nav) => {
		if (dirtyCount === 0 || nav.type === 'leave' || !form) return;
		const from = nav.from?.url;
		const to = nav.to?.url;
		if (from && to && from.pathname === to.pathname && from.search === to.search) return;

		if (!confirm('保存していない変更があります。保存せずにこのページを離れますか？')) {
			nav.cancel();
			return;
		}
		if (timer) clearTimeout(timer);
		writeDraft(changedFields(form));
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
