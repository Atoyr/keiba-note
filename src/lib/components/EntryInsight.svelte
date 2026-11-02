<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import InsightView from '$lib/components/InsightView.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { INSIGHT_MEMO_MAX } from '$lib/schemas/insight';
	import type { InsightSaver } from '$lib/utils/insight-saver.svelte';
	import { cn } from '$lib/utils';

	/**
	 * 「気づき」タブの1行（1頭ぶん）。レース直後に、その馬へ自分の言葉を押して付け、短いメモを残す。
	 * ふりかえり本文（`EntryNoteEditor`）とは別の入力で、本文には混ざらない。
	 *
	 * - 閉じているとき: `[着順] [枠・馬番] 馬名 ⌄` の1行。気づきがあれば馬名の下に `InsightView`（札は付けない。タブの中なので）。
	 *   ボタンの読み上げ名は中身（着順・馬番・馬名＋「の気づき」・言葉・メモ）で、開閉では変えない（開いているかは `aria-expanded`）。
	 * - 開いたとき: 言葉のボタン（押す＝付ける、もう一度押す＝外す。押した時点で保存）と、メモの欄。
	 *   **開いてもフォーカスを動かさない**（スマホのキーボードが出ると言葉が隠れる）。Esc で閉じてボタンへ戻す。
	 *   開閉は親が持つ（`open`。1度に開くのは1頭。`EntryInsightList`）。
	 * - 保存は `InsightSaver`（1 操作 1 リクエスト）。押した言葉はすぐ ✓ と太字にするが、サーバーの応答までは
	 *   破線で、保存済みに見せない。失敗は開閉に関係なく行の下に出す。
	 *
	 * 言葉のボタンとメモの欄は `form` 属性で `formId` のフォームに属す。大きいふりかえりのフォームの DOM の中に
	 * 置いても、そのフォームの `elements` には入らないので、未保存の件数・下書きに混ざらない。
	 * JS が無いときは、行を開け閉めのできない見出しにして中身を出しっぱなしにし、言葉のボタンがそのまま送信ボタン、
	 * メモは noscript の送信ボタンで保存する。
	 */
	let {
		horseName,
		entryId,
		saver,
		registered,
		formId,
		open = $bindable(false),
		bracket = null,
		horseNumber = null,
		finishPosition = null,
		rankColumn = false,
		badgeColumn = true
	}: {
		horseName: string;
		entryId: string;
		saver: InsightSaver;
		/** 自分が登録した言葉（登録順）。 */
		registered: string[];
		/** 送り先のフォームの id。 */
		formId: string;
		/** 開いているか。親が持つ（1度に開くのは1頭）。 */
		open?: boolean;
		bracket?: number | null;
		horseNumber?: number | null;
		/** 着順。結果がまだ無ければ null（着順は出さない）。 */
		finishPosition?: number | null;
		/** 着順の列を取るか。一覧のだれかに着順があれば全行が取る（着順の無い馬も幅だけ取り、馬名の位置をそろえる）。 */
		rankColumn?: boolean;
		/** 札（枠・馬番）の列を取るか。一覧のだれかに札があれば全行が取る。 */
		badgeColumn?: boolean;
	} = $props();

	const id = $props.id();
	const boxId = `entry-insight-${id}`;

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
	/** 保存は通ったが、1頭の上限で言葉が付かなかったときの文。 */
	const notice = $derived(saver.notice(entryId));
	const loginHref = $derived(
		`${resolve('/login')}?redirect=${encodeURIComponent(`${page.url.pathname}?tab=insights`)}`
	);
	const hasValue = $derived(pressed.length > 0 || memo.trim() !== '');

	/** 開け閉めのボタンにも入力欄にも効くよう、両方を囲む要素に置く。 */
	function onkeydown(e: KeyboardEvent) {
		// 変換中の Esc（変換の取り消し）では閉じない。
		if (e.key !== 'Escape' || !open || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		open = false;
		// 入力欄の中にあったフォーカスを、開け閉めのボタンへ戻す。
		void tick().then(() => toggle?.focus());
	}

	/** 「もう一度保存する」は押すと消えるので、消える前にフォーカスを開け閉めのボタンへ移す。 */
	function retry() {
		toggle?.focus();
		saver.retry(entryId);
	}
</script>

<!-- JS が無いときは、中身を出しっぱなしにして、行は開け閉めのできない見出しとして残す（馬名が読めるように）。 -->
<svelte:head>
	<noscript
		><style>
			@layer base {
				.entry-insight-box[hidden] {
					display: grid !important;
				}
			}
			.entry-insight-chevron {
				display: none !important;
			}
			.entry-insight-toggle:disabled {
				opacity: 1;
			}
		</style></noscript
	>
</svelte:head>

<div {onkeydown} role="presentation">
	<Button
		bind:ref={toggle}
		type="button"
		variant="ghost"
		disabled={!mounted}
		aria-expanded={open}
		aria-controls={boxId}
		class="entry-insight-toggle h-auto min-h-11 w-full items-start justify-start rounded-none px-3 py-1.5 text-left font-normal whitespace-normal aria-expanded:bg-transparent hover:aria-expanded:bg-muted"
		onclick={() => (open = !open)}
	>
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
				>{horseName}<span class="sr-only">の気づき</span></span
			>
			{#if !open && hasValue}
				<InsightView
					class="mt-0.5 font-normal"
					label={false}
					words={pressed.map((w) => ({ word: w.word, unsaved: w.unsaved }))}
					{memo}
					clamp
				/>
			{/if}
		</span>
		{#if open}
			<ChevronUpIcon
				class="entry-insight-chevron mt-1 size-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		{:else}
			<ChevronDownIcon
				class="entry-insight-chevron mt-1 size-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		{/if}
	</Button>

	<div id={boxId} hidden={!open} class="entry-insight-box grid gap-2 px-3 pb-3">
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
							'h-auto min-h-11 gap-1 px-3 text-sm whitespace-normal sm:min-h-9',
							w.pressed ? 'border-foreground bg-muted font-semibold' : 'font-normal',
							w.unsaved && 'border-dashed'
						)}
						onclick={(e) => {
							e.preventDefault();
							// 登録に無い言葉は外すとボタンごと消える。消える前にフォーカスを開け閉めのボタンへ移す。
							if (w.pressed && !registered.includes(w.word)) toggle?.focus();
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

		<div>
			<p role="status" class="min-h-4 text-xs text-muted-foreground">
				{#if status === 'saving'}保存中…{:else if notice}{notice}{:else if status === 'saved'}保存しました{/if}
			</p>
		</div>
	</div>

	<!-- 上限の文は、行が閉じていても出す（開いているあいだは状態の行にあるので重ねない）。 -->
	{#if !open && notice && status !== 'failed'}
		<p role="status" class="px-3 pb-3 text-xs text-muted-foreground">{notice}</p>
	{/if}

	{#if status === 'failed'}
		<div role="alert" class="grid gap-1.5 px-3 pb-3 text-sm text-destructive">
			<p>{saver.message(entryId)}</p>
			<div>
				{#if saver.loginRequired(entryId)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、戻り先のクエリだけを足す -->
					<a
						href={loginHref}
						class="inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-7"
						>ログインする</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else}
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="min-h-11 sm:min-h-7"
						onclick={retry}
						><span class="sr-only">{horseName}の気づきを</span>もう一度保存する</Button
					>
				{/if}
			</div>
		</div>
	{/if}
</div>
