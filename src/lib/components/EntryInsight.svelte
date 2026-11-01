<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import CheckIcon from '@lucide/svelte/icons/check';
	import InsightView from '$lib/components/InsightView.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { INSIGHT_MEMO_MAX } from '$lib/schemas/insight';
	import type { InsightSaver } from '$lib/utils/insight-saver.svelte';
	import { cn } from '$lib/utils';

	/**
	 * 出走馬の行の「気づき」。レース直後に、その馬へ自分の言葉を押して付け、短いメモを残す。
	 * ふりかえり本文（`EntryNoteEditor`）とは別の入力で、本文には混ざらない。
	 *
	 * - 閉じているとき: 気づきがあれば `InsightView` をボタンの中に、無ければ「＋ 気づき」。右端に ⌄。
	 * - 開いたとき: 言葉のボタン（押す＝付ける、もう一度押す＝外す。押した時点で保存）と、メモの欄。
	 *   **開いてもフォーカスを動かさない**（スマホのキーボードが出ると言葉が隠れる）。Esc で閉じてボタンへ戻す。
	 * - 保存は `InsightSaver`（1 操作 1 リクエスト）。押した言葉はすぐ ✓ と太字にするが、サーバーの応答までは
	 *   破線で、保存済みに見せない。失敗は開閉に関係なく行の下に出す。
	 *
	 * 言葉のボタンとメモの欄は `form` 属性で `formId` のフォームに属す。大きいふりかえりのフォームの DOM の中に
	 * 置いても、そのフォームの `elements` には入らないので、未保存の件数・下書きに混ざらない。
	 * JS が無いときは、言葉のボタンがそのまま送信ボタンで、メモは noscript の送信ボタンで保存する。
	 */
	let {
		horseName,
		entryId,
		saver,
		registered,
		formId
	}: {
		horseName: string;
		entryId: string;
		saver: InsightSaver;
		/** 自分が登録した言葉（登録順）。 */
		registered: string[];
		/** 送り先のフォームの id。 */
		formId: string;
	} = $props();

	const id = $props.id();
	const boxId = `entry-insight-${id}`;

	let open = $state(false);
	/** hydration が済むまでボタンを押せなくする（済む前は押しても何も起きない）。 */
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	let toggle = $state<HTMLElement | null>(null);

	const words = $derived(saver.words(entryId, registered));
	const pressed = $derived(words.filter((w) => w.pressed));
	const memo = $derived(saver.memo(entryId));
	const status = $derived(saver.status(entryId));
	const hasValue = $derived(pressed.length > 0 || memo.trim() !== '');

	function onkeydown(e: KeyboardEvent) {
		// 変換中の Esc（変換の取り消し）では閉じない。
		if (e.key !== 'Escape' || !open || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		open = false;
		// 入力欄の中にあったフォーカスを、開け閉めのボタンへ戻す。
		void tick().then(() => toggle?.focus());
	}
</script>

<!-- JS が無いときは、中身を出しっぱなしにして開け閉めのボタンを隠す（EntryNoteEditor と同じ書き方）。 -->
<svelte:head>
	<noscript
		><style>
			@layer base {
				.entry-insight-box[hidden] {
					display: grid !important;
				}
			}
			.entry-insight-toggle {
				display: none !important;
			}
		</style></noscript
	>
</svelte:head>

<div class="mt-2">
	<div class="-mx-2.5">
		<Button
			bind:ref={toggle}
			type="button"
			variant="ghost"
			disabled={!mounted}
			aria-expanded={open}
			aria-controls={boxId}
			class={cn(
				'entry-insight-toggle h-auto min-h-11 w-full justify-start px-2.5 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent hover:aria-expanded:bg-muted',
				!open && hasValue ? 'items-start' : 'items-center'
			)}
			onclick={() => (open = !open)}
		>
			{#if open}
				<span class="sr-only">{horseName}の</span>
				<span class="min-w-0 flex-1 text-sm font-medium text-muted-foreground">気づき</span>
				<ChevronUpIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{:else if hasValue}
				<span class="sr-only">{horseName}の気づきを開く。</span>
				<span class="block min-w-0 flex-1">
					<InsightView
						words={pressed.map((w) => ({ word: w.word, unsaved: w.unsaved }))}
						{memo}
						clamp
					/>
				</span>
				<ChevronDownIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{:else}
				<span class="min-w-0 flex-1 text-muted-foreground"
					><span class="sr-only">{horseName}の</span>＋ 気づき</span
				>
				<ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			{/if}
		</Button>
	</div>

	<div
		id={boxId}
		hidden={!open}
		class="entry-insight-box grid gap-2"
		{onkeydown}
		role="presentation"
	>
		{#if registered.length === 0}
			<p class="text-sm text-muted-foreground">
				よく使う言葉を登録すると、押すだけで残せます。
				<a
					href={resolve('/settings/insight-words')}
					class="underline underline-offset-2 hover:decoration-2">言葉を登録する</a
				>
			</p>
		{/if}

		{#if words.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each words as w (w.word)}
					<!-- 押した時点で保存する。JS が無いときは、このボタンがそのまま送信ボタン（value の JSON が入力）。 -->
					<Button
						type="submit"
						variant="outline"
						form={formId}
						name="toggle"
						value={JSON.stringify({ entryId, word: w.word, on: !w.pressed })}
						aria-pressed={w.pressed}
						class={cn(
							'h-auto min-h-11 gap-1 px-3 text-sm sm:min-h-9',
							w.pressed ? 'border-foreground bg-muted font-semibold' : 'font-normal',
							w.unsaved && 'border-dashed'
						)}
						onclick={(e) => {
							e.preventDefault();
							saver.toggle(entryId, w.word);
						}}
					>
						{#if w.pressed}<CheckIcon class="size-3.5 shrink-0" aria-hidden="true" />{/if}
						<span class="sr-only">{horseName}の</span>{w.word}
					</Button>
				{/each}
			</div>
		{/if}

		<Textarea
			form={formId}
			name="insightMemo.{entryId}"
			rows={2}
			maxlength={INSIGHT_MEMO_MAX}
			aria-label="{horseName}の気づき"
			placeholder="前が壁になった。2400 なら。"
			class="text-sm"
			value={memo}
			oninput={(e) => saver.setMemo(entryId, e.currentTarget.value)}
			onblur={() => saver.flushMemo(entryId)}
		/>

		<noscript>
			<Button
				type="submit"
				variant="outline"
				form={formId}
				name="saveMemo"
				value={entryId}
				class="h-auto min-h-11 px-3 text-sm"
			>
				この馬のメモを保存する
			</Button>
		</noscript>

		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
			<p role="status" class="min-h-4 text-xs text-muted-foreground">
				{#if status === 'saving'}保存中…{:else if status === 'saved'}保存しました{/if}
			</p>
			<a
				href={resolve('/settings/insight-words')}
				class="inline-flex min-h-6 items-center text-xs text-muted-foreground underline underline-offset-2 hover:decoration-2"
				>言葉を登録・編集する</a
			>
		</div>
	</div>

	{#if status === 'failed'}
		<div role="alert" class="mt-1 grid gap-1.5 text-sm text-destructive">
			<p>この馬の気づきを保存できませんでした。入力は端末に残っています。</p>
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="min-h-11 sm:min-h-7"
					onclick={() => saver.retry(entryId)}
					><span class="sr-only">{horseName}の気づきを</span>もう一度保存する</Button
				>
			</div>
		</div>
	{/if}
</div>
