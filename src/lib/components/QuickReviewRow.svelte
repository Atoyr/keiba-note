<script lang="ts">
	import { tick } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import CheckIcon from '@lucide/svelte/icons/check';
	import HorseNumberBadge from '#lib/components/HorseNumberBadge.svelte';
	import MarkBadge from '#lib/components/MarkBadge.svelte';
	import type { Mark } from '#lib/schemas/note.ts';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { hasQuickWord, toggleQuickWord } from '#lib/utils/quick-words.ts';
	import { cn } from '#lib/utils.ts';

	/**
	 * クイック入力の1行（1頭ぶん）。言葉を押すと、その馬のふりかえりメモの本文に入る（もう一度押すと抜ける）。
	 *
	 * - 閉じているとき: `[着順] [枠・馬番] 馬名 [印] ⌄` の1行。本文があれば馬名の下に3行まで出す。
	 *   ボタンの読み上げ名は「馬名のクイック入力」＋本文（印があれば「印◎」も）で、開閉では変えない（開いているかは `aria-expanded`）。
	 * - 開いたとき: 登録した言葉のボタン（`aria-pressed` は**本文から決まる**）。押すと `onchange` に入れた（抜いた）本文を渡す。
	 *   **開いてもフォーカスを動かさない**（スマホのキーボードで言葉が隠れないように）。Esc で閉じて行のボタンへ戻す。
	 * - 保存もこの行の外（親）がする。この行は保存の状態（`status`）を開いた中の状態の行に出し、失敗したら「もう一度保存」で `onretry` を呼ぶ。
	 *   閉じた行で失敗しているときは、馬名の横に「未保存」と字で出す。本文を持つのは親（ふりかえりのフォームの欄）。
	 * - `draft` は、ふりかえりで手で書いた未保存の本文があるとき。言葉を選ぶと書きかけも一緒に保存されるので、開いた中で先に知らせる。
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
		badgeColumn = true,
		mark = null,
		markColumn = false,
		status = null,
		draft = false,
		onretry
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
		/** 予想で付けた印（読むだけ）。 */
		mark?: Mark | null;
		/** 印の列を取るか。一覧のだれかに印があれば全行が取る（馬名の幅を行ごとにずらさない）。 */
		markColumn?: boolean;
		/** 保存の状態。まだ送っていなければ null。 */
		status?: 'saving' | 'saved' | 'error' | null;
		/** ふりかえりで手で書いた未保存の本文があるか（言葉を選ぶと一緒に保存される）。 */
		draft?: boolean;
		/** 保存に失敗したとき「もう一度保存」で呼ぶ。 */
		onretry?: () => void;
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

	function retry() {
		onretry?.();
		// 押したボタンは失敗の表示と一緒に消えるので、フォーカスを行のボタンへ移す。
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
			>{horseName}{#if !readonly}<span class="sr-only">のクイック入力</span
				>{/if}{#if !open && status === 'error'}<span
					class="ml-1.5 text-xs font-normal text-destructive">未保存</span
				>{/if}</span
		>
		{#if !open && text !== ''}
			<span
				class="mt-0.5 line-clamp-3 block text-xs leading-5 font-normal whitespace-pre-wrap text-muted-foreground"
				>{text}</span
			>
		{/if}
	</span>
	{#if markColumn || mark}
		<span class="flex w-6 shrink-0 justify-center">
			{#if mark}<span class="sr-only">印</span><MarkBadge {mark} />{/if}
		</span>
	{/if}
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
			{#if draft}
				<p class="text-xs text-muted-foreground">
					ふりかえりで書きかけの本文があります。言葉を選ぶと、書きかけも一緒に保存します。
				</p>
			{/if}
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
			{#if status === 'error' && !tooLong}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<p role="alert" class="text-xs text-destructive">保存できませんでした。</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="min-h-11 sm:min-h-9"
						onclick={retry}>もう一度保存</Button
					>
				</div>
			{:else}
				<p role="status" class="min-h-4 text-xs text-muted-foreground">
					{#if tooLong}メモが長すぎるため、これ以上入れられません。{:else if status === 'saving'}保存中…{:else if status === 'saved'}保存しました{/if}
				</p>
			{/if}
		</div>
	{/if}
</div>
