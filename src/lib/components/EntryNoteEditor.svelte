<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 出走馬の行の、メモを「その場で書く」部分。行は畳まない。**見出しで開け閉めする折りたたみ**。
	 *
	 * - 折りたたんでいるとき: メモがあれば**メモの表示そのものがボタン**（押すと書き直せる）、無ければ「＋ {label}」のボタン。右端に ⌄。
	 * - 押すと入力欄（`children`）が開き、ボタンはその場で見出し「{label} ⌃」になって、本文の欄にフォーカスが移る。
	 *   見出しを押す（か Esc）と折りたたんで元の表示に戻る。折りたたむのは保存でも破棄でもない（入力は一括フォームに残る）。
	 *   書いている間はメモの表示を出さない（入力欄と同じものが2つ並ぶため）。
	 *
	 * 開け閉めのボタンは1つ（`toggle`）で、入力欄の上に常に描く。同じ要素なので、折りたたんでもフォーカスは動かない。
	 * `aria-expanded` と `aria-controls` を付けて、開いているかを読み上げに伝える（開くと名前が「{馬名}の{label}」に変わる）。
	 *
	 * **入力欄は折りたたんでいる間も DOM に残す**（`hidden`）。一括フォームに乗り続けるので、未保存の件数・下書き・AI の反映は
	 * 折りたたんだままでも効く。JS が無いときは押しても何も起きないので、入力欄を出しっぱなしにしてボタンを隠す
	 * （`<noscript>` の style。RacePanels と同じ書き方）。
	 *
	 * ボタンの名前は aria-label で上書きせず、見えている文字の前に馬名の sr-only を足して作る（WCAG 2.5.3）。
	 * `editing` は親が保存後に折りたたむために `$bindable`。
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
	 * ボタンは hydration が済むまで押せない（disabled）。済む前は押しても何も起きず、入力欄も隠れたままなので、
	 * 押せないと見えるようにして、押したのに無反応にならないようにする。JS が無いときは下の noscript がボタンを隠す。
	 */
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	let box = $state<HTMLElement | null>(null);
	let toggle = $state<HTMLElement | null>(null);

	async function open() {
		editing = true;
		await tick();
		box?.querySelector('textarea')?.focus();
	}

	/** ボタンから折りたたむとき。フォーカスは同じボタンに残るので動かさない。 */
	function collapse() {
		editing = false;
	}

	function onkeydown(e: KeyboardEvent) {
		// 変換中の Esc（変換の取り消し）では折りたたまない。
		if (e.key !== 'Escape' || !editing || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		collapse();
		// 入力欄の中にあったフォーカスを、見出しのボタンへ戻す。
		void tick().then(() => toggle?.focus());
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
			.entry-note-toggle {
				display: none !important;
			}
		</style></noscript
	>
</svelte:head>

<div class="mt-2">
	<!-- 負の余白の箱に入れて、ボタンの文字を印の左端にそろえる（hover の面はその分だけ外へ広がる）。
	     3つの状態（メモあり・メモなし・書いている）とも同じ箱・同じ位置に出し、右端に山形を置く。 -->
	<div class="-mx-2.5">
		<Button
			bind:ref={toggle}
			type="button"
			variant="ghost"
			disabled={!mounted}
			aria-expanded={editing}
			aria-controls={boxId}
			class="entry-note-toggle h-auto min-h-11 w-full justify-start px-2.5 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent hover:aria-expanded:bg-muted {!editing &&
			hasMemo
				? 'items-start'
				: 'items-center'}"
			onclick={() => (editing ? collapse() : void open())}
		>
			{#if editing}
				<span class="sr-only">{horseName}の</span>
				<span class="min-w-0 flex-1 text-sm font-medium text-muted-foreground">{label}</span>
				<ChevronUpIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{:else if hasMemo}
				<span class="sr-only">{horseName}の{label}を書き直す。</span>
				<!-- ボタンの中なので span だけで組む（EntryMemo も span だけ）。 -->
				<span class="block min-w-0 flex-1">{@render memo()}</span>
				<!-- 押せば書けることを、hover に頼らず見せる（スマホには hover が無い）。ふりかえり画面では、
				     読むだけの出走前メモと見分ける手がかりにもなる。名前は sr-only の文で足りるので読み上げない。 -->
				<ChevronDownIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{:else}
				<span class="min-w-0 flex-1 text-muted-foreground"
					><span class="sr-only">{horseName}の</span>＋ {label}</span
				>
				<ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{/if}
		</Button>
	</div>
	<div
		id={boxId}
		bind:this={box}
		hidden={!editing}
		class="entry-note-box grid gap-2"
		{onkeydown}
		role="presentation"
	>
		{@render children()}
	</div>
</div>
