<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 出走馬の行の、メモを「その場で書く」部分。行は畳まない。
	 *
	 * - 書いていないとき: メモがあれば**メモの表示そのものがボタン**（押すと書き直せる）、無ければ「＋ {label}」のボタン。
	 * - 押すと入力欄（`children`）に替わり、本文の欄にフォーカスが移る。下の「閉じる」（か Esc）で戻り、フォーカスはボタンへ戻る。
	 *   閉じるは保存でも破棄でもない（入力は一括フォームに残る）。保存の操作と取り違えないよう、ボタンは控えめに出す。
	 *   書いている間はメモの表示を出さない（入力欄と同じものが2つ並ぶため）。
	 *
	 * **入力欄は書いていない間も DOM に残す**（`hidden`）。一括フォームに乗り続けるので、未保存の件数・下書き・AI の反映は
	 * 閉じたままでも効く。JS が無いときは押しても何も起きないので、入力欄を出しっぱなしにしてボタンを隠す
	 * （`<noscript>` の style。RacePanels と同じ書き方）。
	 *
	 * ボタンの名前は aria-label で上書きせず、見えている文字の前に馬名の sr-only を足して作る（WCAG 2.5.3）。
	 * `editing` は親が保存後に閉じるために `$bindable`。
	 */
	let {
		horseName,
		label,
		hasMemo,
		editing = $bindable(false),
		memo,
		children
	}: {
		horseName: string;
		label: '出走前メモ' | 'ふりかえりメモ';
		/** メモ（本文か札）があるか。あれば `memo` をボタンにして出す。 */
		hasMemo: boolean;
		editing?: boolean;
		/** 書いたメモの表示（`EntryMemo`）。 */
		memo: Snippet;
		/** 入力欄（本文の Textarea と TagPicker）。 */
		children: Snippet;
	} = $props();

	const id = $props.id();
	const boxId = `entry-note-${id}`;
	/**
	 * 開くボタンは hydration が済むまで押せない（disabled）。済む前は押しても何も起きず、入力欄も隠れたままなので、
	 * 押せないと見えるようにして、押したのに無反応にならないようにする。JS が無いときは下の noscript がボタンを隠す。
	 */
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	let box = $state<HTMLElement | null>(null);
	let opener = $state<HTMLElement | null>(null);

	async function open() {
		editing = true;
		await tick();
		box?.querySelector('textarea')?.focus();
	}

	async function close() {
		editing = false;
		await tick();
		opener?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		// 変換中の Esc（変換の取り消し）では閉じない。
		if (e.key !== 'Escape' || !editing || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		void close();
	}
</script>

<!-- JS が無いときは、入力欄を出しっぱなしにしてボタンを隠す。preflight の `[hidden]` は `!important` で `@layer base` の中にあり、
     `!important` は層に入っているほうが入っていないほうに勝つ。なので同じ `base` の層の中で、より強い指定（詳細度）で上書きする。 -->
<svelte:head>
	<noscript
		><style>
			@layer base {
				.entry-note-box[hidden] {
					display: grid !important;
				}
			}
			.entry-note-open,
			.entry-note-close {
				display: none !important;
			}
		</style></noscript
	>
</svelte:head>

<div class="mt-2">
	{#if !editing}
		{#if hasMemo}
			<!-- 負の余白の箱に入れて、ボタンの文字を印の左端にそろえる（hover の面はその分だけ外へ広がる）。 -->
			<div class="-mx-2.5">
				<Button
					bind:ref={opener}
					type="button"
					variant="ghost"
					disabled={!mounted}
					class="entry-note-open h-auto min-h-11 w-full items-start justify-start px-2.5 py-1.5 text-left font-normal whitespace-normal"
					onclick={open}
				>
					<span class="sr-only">{horseName}の{label}を書き直す。</span>
					<!-- ボタンの中なので span だけで組む（EntryMemo も span だけ）。 -->
					<span class="block min-w-0 flex-1">{@render memo()}</span>
					<!-- 押せば書けることを、hover に頼らず見せる（スマホには hover が無い）。ふりかえり画面では、
					     読むだけの出走前メモと見分ける手がかりにもなる。名前は sr-only の文で足りるので読み上げない。 -->
					<PencilIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				</Button>
			</div>
		{:else}
			<Button
				bind:ref={opener}
				type="button"
				variant="ghost"
				size="sm"
				disabled={!mounted}
				class="entry-note-open -ml-2.5 h-auto min-h-11 justify-start text-muted-foreground"
				onclick={open}
			>
				<span class="sr-only">{horseName}の</span>＋ {label}
			</Button>
		{/if}
	{/if}
	<div
		id={boxId}
		bind:this={box}
		hidden={!editing}
		class="entry-note-box grid gap-2"
		{onkeydown}
		role="presentation"
	>
		{@render children()}
		<div class="flex justify-end">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="entry-note-close -mr-2.5 text-muted-foreground"
				onclick={close}
			>
				<XIcon class="size-4" aria-hidden="true" />
				<span class="sr-only">{horseName}の{label}を</span>閉じる
			</Button>
		</div>
	</div>
</div>
