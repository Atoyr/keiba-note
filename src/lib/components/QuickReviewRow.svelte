<script lang="ts">
	import { tick } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import CheckIcon from '@lucide/svelte/icons/check';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { hasQuickWord, toggleQuickWord } from '$lib/utils/quick-words';
	import { cn } from '$lib/utils';

	/**
	 * クイック入力の1行（1頭ぶん）。言葉を押すと、その馬のふりかえりメモの本文に入る（もう一度押すと抜ける）。
	 *
	 * - 閉じているとき: `[着順] [枠・馬番] 馬名 ⌄` の1行。本文があれば馬名の下に3行まで出す。
	 *   ボタンの読み上げ名は「馬名のクイック入力」＋本文で、開閉では変えない（開いているかは `aria-expanded`）。
	 * - 開いたとき: 登録した言葉のボタン（`aria-pressed` は**本文から決まる**）。押すと `onchange` に入れた（抜いた）本文を渡す。
	 *   **開いてもフォーカスを動かさない**（スマホのキーボードで言葉が隠れないように）。Esc で閉じて行のボタンへ戻す。
	 * - 保存はしない（ふりかえりに戻って、ふりかえりの保存ボタンで一括）。本文を持つのは親（ふりかえりのフォームの欄）。
	 * - 登録した言葉が0個のあいだは開けない（行のボタンを出さず、読むだけの行にする）。
	 * - 開閉は親が持つ（`open`。1度に開くのは1頭。`QuickReview`）。
	 */
	let {
		horseName,
		entryId,
		body,
		registered,
		onchange,
		open = $bindable(false),
		bracket = null,
		horseNumber = null,
		finishPosition = null,
		rankColumn = false,
		badgeColumn = true
	}: {
		horseName: string;
		entryId: string;
		/** いまのふりかえりメモの本文。 */
		body: string;
		/** 自分が登録した言葉（登録順）。 */
		registered: string[];
		/** 言葉を押して本文が変わるとき、新しい本文を渡す。 */
		onchange: (entryId: string, body: string) => void;
		/** 開いているか。親が持つ（1度に開くのは1頭）。 */
		open?: boolean;
		bracket?: number | null;
		horseNumber?: number | null;
		/** 着順。結果がまだ無ければ null（着順は出さない）。 */
		finishPosition?: number | null;
		/** 着順の列を取るか。一覧のだれかに着順があれば全行が取る。 */
		rankColumn?: boolean;
		/** 札（枠・馬番）の列を取るか。一覧のだれかに札があれば全行が取る。 */
		badgeColumn?: boolean;
	} = $props();

	const id = $props.id();
	const boxId = `quick-review-${id}`;
	let toggle = $state<HTMLElement | null>(null);
	let tooLong = $state(false);

	const text = $derived(body.trim());
	/** 登録した言葉が無いあいだは開けない（押せる言葉が無いので、読むだけの行にする）。 */
	const readonly = $derived(registered.length === 0);

	function onkeydown(e: KeyboardEvent) {
		// 変換中の Esc（変換の取り消し）では閉じない。
		if (e.key !== 'Escape' || !open || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		open = false;
		void tick().then(() => toggle?.focus());
	}

	function press(word: string) {
		const next = toggleQuickWord(body, word);
		if (next === null) {
			tooLong = true;
			return;
		}
		tooLong = false;
		onchange(entryId, next);
	}
</script>

{#snippet content()}
	{#if rankColumn || finishPosition}
		<span class="w-8 shrink-0 text-sm leading-6 font-bold whitespace-nowrap"
			>{#if finishPosition}{finishPosition}着{/if}</span
		>
	{/if}
	{#if badgeColumn}
		<span class="flex w-11 shrink-0 items-center py-px">
			<HorseNumberBadge {bracket} {horseNumber} />
		</span>
	{/if}
	<span class="block min-w-0 flex-1">
		<span class="block text-sm leading-6 font-medium break-words"
			>{horseName}{#if !readonly}<span class="sr-only">のクイック入力</span>{/if}</span
		>
		{#if !open && text !== ''}
			<span
				class="mt-0.5 line-clamp-3 block text-xs leading-5 font-normal whitespace-pre-wrap text-muted-foreground"
				>{text}</span
			>
		{/if}
	</span>
	{#if readonly}
		<!-- 言葉が無いので開けない（次の一手は一覧の上の案内） -->
	{:else if open}
		<ChevronUpIcon class="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
	{:else}
		<ChevronDownIcon class="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
	{/if}
{/snippet}

<div {onkeydown} role="presentation">
	{#if readonly}
		<!-- 言葉が0個のあいだは開けない。着順・札・馬名・本文を読むだけの行にする（aria-expanded も付けない）。 -->
		<div class="flex min-h-11 w-full items-start gap-2 px-3 py-1.5 text-left text-sm">
			{@render content()}
		</div>
	{:else}
		<Button
			bind:ref={toggle}
			type="button"
			variant="ghost"
			aria-expanded={open}
			aria-controls={boxId}
			class="h-auto min-h-11 w-full items-start justify-start rounded-none px-3 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent hover:aria-expanded:bg-muted"
			onclick={() => (open = !open)}
		>
			{@render content()}
		</Button>
	{/if}

	{#if !readonly}
		<div id={boxId} hidden={!open} class="grid gap-2 px-3 pb-3">
			{#if registered.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each registered as w (w)}
						{@const pressed = hasQuickWord(body, w)}
						<Button
							type="button"
							variant="outline"
							aria-pressed={pressed}
							class={cn(
								'h-auto min-h-11 gap-1 px-3 text-sm whitespace-normal sm:min-h-9',
								pressed ? 'border-foreground bg-muted font-semibold' : 'font-normal'
							)}
							onclick={() => press(w)}
						>
							{#if pressed}<CheckIcon class="size-3.5 shrink-0" aria-hidden="true" />{/if}
							<span class="sr-only">{horseName}の</span>{w}
						</Button>
					{/each}
				</div>
			{/if}
			<p role="status" class="min-h-4 text-xs text-muted-foreground">
				{#if tooLong}メモが長すぎるため、これ以上入れられません。{/if}
			</p>
		</div>
	{/if}
</div>
