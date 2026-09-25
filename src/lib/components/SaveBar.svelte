<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 一括保存フォームの末尾に貼り付く保存ボタン。**未保存の変更があるときだけ出す。**
	 *
	 * いつでもボタンが出ていると、押す必要があるのか（書いたものが保存済みか）が
	 * 画面から読めない。ボタンが出ていること自体を「保存していないものがある」の合図にし、
	 * 件数を横に添える。保存が通れば `DraftKeeper` が件数を0に戻すので、ボタンも消える。
	 *
	 * **保存に失敗したときの文もここに出す。** 押した指の近くに出さないと、画面の上に出た文に
	 * 気づかず、ボタンが残っているだけに見える。成功の知らせはトースト（呼ぶ側）。
	 *
	 * **JavaScript が無いときは常に出す。** 件数を数えるのは `DraftKeeper`（JS）なので、
	 * JS が無いと件数は0のまま。それで隠すとフォームが送れなくなる。
	 * `<noscript>` の中身は JS が有効なブラウザでは描かれないので、読み込み中にボタンが
	 * 一瞬出て消える、ということも起きない。JS が無いときの失敗の文は、ページの上に出す（呼ぶ側）。
	 */
	let {
		dirtyCount,
		label,
		pending = false,
		message = null
	}: {
		/** 未保存の変更の件数。`DraftKeeper` から bind で受ける。 */
		dirtyCount: number;
		/** ボタンの文言（`previewSaveLabel` など）。 */
		label: string;
		/** 送信中。二度押しさせず、押したことが分かるようにする。 */
		pending?: boolean;
		/** 保存に失敗したときの文（`form.message`）。 */
		message?: string | null;
	} = $props();

	const bar = 'sticky bottom-0 mt-6 border-t bg-background/90 py-3 backdrop-blur';

	let barEl = $state<HTMLElement | null>(null);

	/**
	 * 保存が通ってボタンが消えるとき、フォーカスをフォームへ移す。
	 * そのままだとフォーカスが body に落ち、キーボードで押した人が行き場を失う。
	 * フォームは `tabindex="-1"` を持つ（呼ぶ側）。`$effect.pre` なのは、ボタンが
	 * DOM から消える前に「フォーカスがバーの中にあったか」を見るため。
	 *
	 * **body にある場合も移す。** 保存が通ると SvelteKit の `applyAction` がフォーカスを
	 * body に戻す（ページを移ったときと同じ扱い）。ボタンが消えるのはそのあと。
	 */
	$effect.pre(() => {
		if (dirtyCount > 0 || !barEl) return;
		const active = document.activeElement;
		if (active !== document.body && !barEl.contains(active)) return;
		const form = barEl.closest('form');
		void tick().then(() => form?.focus({ preventScroll: true }));
	});
</script>

{#if dirtyCount > 0 || message}
	<div bind:this={barEl} class="{bar} flex flex-wrap items-center gap-x-3 gap-y-2">
		{#if message}
			<p class="w-full text-sm text-destructive" role="alert">{message}</p>
		{/if}
		{#if dirtyCount > 0}
			<p class="text-xs text-amber-700" aria-live="polite">
				未保存の変更が {dirtyCount} 件あります
			</p>
			<!-- 送信中は `disabled` ではなく aria-disabled にして、押しても送らない。`disabled` にすると
			     ブラウザがフォーカスを外し（body に落ちる）、キーボードで押した人が行き場を失う。 -->
			<Button
				type="submit"
				aria-disabled={pending}
				onclick={(e) => {
					if (pending) e.preventDefault();
				}}
				class="w-full aria-disabled:opacity-50 sm:ml-auto sm:w-auto sm:min-w-48"
			>
				{pending ? '保存しています…' : label}
			</Button>
		{/if}
	</div>
{/if}

<noscript>
	<div class={bar}>
		<Button type="submit" class="w-full">{label}</Button>
	</div>
</noscript>
