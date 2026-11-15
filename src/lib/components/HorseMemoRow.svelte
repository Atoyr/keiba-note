<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import { onMount } from 'svelte';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import type { HorseTraitTag, HorseTraitValue } from '#lib/schemas/horse.ts';
	import type { NoteTag } from '#lib/schemas/note.ts';
	import HorseTraitTagBadges from './HorseTraitTagBadges.svelte';
	import TagBadges from './TagBadges.svelte';

	/**
	 * 出走馬の行で、馬名の下に置く1行。左から
	 *
	 * 1. **メモのアイコン**（自分のメモ＝本文か札があるときだけ）。押すと Popover で本文 → 札 → 「馬の画面へ」を開く。
	 *    馬名を押したときの Popover（`HorseLink`）は基本情報だけで、メモはここ。
	 * 2. **このレースに合う札**（場・回り・距離。`raceHorseTraitTags`）。開かずに見えるようにする。
	 * 3. **前回の札**（予想画面だけ。`conclusion`）。以前は名前の列の最後の段にあったものを、この行に移した。
	 *
	 * 3つとも無ければ**行ごと出さない**（行の高さを増やさない）。折り返してよい。
	 *
	 * hover で浮かぶ Tooltip にはしない（理由は `JockeyLink` と同じ）。アイコンは Popover を開くボタンで、
	 * hydration 前（SSR と最初の描画）・JS が無いときは同じアイコンの `<a>` で馬の画面へ行ける。
	 * アイコンの大きさは 24px 四方（design-system.md 第5章の押せる大きさ）。
	 *
	 * 札の色だけで「合う」を伝えない: 合う札の頭に小さなチェックのアイコンを付け、読み上げ用に「このレースに合う札」を添える。
	 */
	let {
		horseId,
		name,
		trait,
		matches,
		conclusion = null,
		class: className = ''
	}: {
		horseId: string;
		name: string;
		trait: HorseTraitValue | null;
		matches: HorseTraitTag[];
		/** 前回の札（予想画面だけ）。ふりかえり画面は渡さない。 */
		conclusion?: { occurredAt: string; tags: NoteTag[] } | null;
		class?: string;
	} = $props();

	const href = $derived(resolve('/horses/[id]', { id: horseId }));
	const body = $derived(trait?.body.trim() ?? '');
	const traitTags = $derived(trait?.tags ?? []);
	const hasMemo = $derived(body !== '' || traitTags.length > 0);
	const hasConclusion = $derived(conclusion !== null && conclusion.tags.length > 0);
	const show = $derived(hasMemo || matches.length > 0 || hasConclusion);

	// SSR と hydration の最初の描画は `<a>` のまま。mounted になってから Popover の button に替える。
	let mounted = $state(false);
	onMount(() => (mounted = true));

	const iconClass =
		'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

{#if show}
	<div
		class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 self-start {className}"
		data-memo-row
	>
		{#if hasMemo}
			{#if mounted}
				<Popover.Root>
					<Popover.Trigger class={iconClass} aria-label="{name}のメモ">
						<NotebookPenIcon class="size-4" aria-hidden="true" />
					</Popover.Trigger>
					<Popover.Content
						role="dialog"
						aria-label="{name}のメモ"
						collisionPadding={8}
						class="w-auto max-w-xs items-start gap-1.5 sm:max-w-sm"
					>
						{#if body}
							<!-- スクロールできる領域は、キーボードでもフォーカスしてスクロールできるようにする（Safari は既定でフォーカスできない）。 -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<p
								tabindex="0"
								class="max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-ring"
							>
								{body}
							</p>
						{/if}
						<HorseTraitTagBadges tags={traitTags} />
						<a
							{href}
							class="inline-flex min-h-6 items-center gap-0.5 font-medium underline underline-offset-2"
						>
							馬の画面へ<ChevronRightIcon class="size-4" aria-hidden="true" />
						</a>
					</Popover.Content>
				</Popover.Root>
			{:else}
				<a {href} class={iconClass} aria-label="{name}のメモ">
					<NotebookPenIcon class="size-4" aria-hidden="true" />
				</a>
			{/if}
		{/if}

		<!-- 合う札は1つずつ行の要素にして、1つずつ折り返す（まとめて1つにすると、狭い幅でまとまりごと次の行へ回り、
		     アイコンだけの行ができる）。チェックのアイコンは先頭の札と離れないよう一緒に包む。 -->
		{#each matches as t, i (t)}
			{#if i === 0}
				<span class="inline-flex items-center gap-1">
					<CircleCheckIcon class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
					<span class="sr-only">このレースに合う札</span>
					<HorseTraitTagBadges tags={[t]} />
				</span>
			{:else}
				<HorseTraitTagBadges tags={[t]} />
			{/if}
		{/each}

		<!-- この馬について最後に下した結論。16頭を見比べるときは本文まで読めないので、札だけを見出しに上げる
		     （何を書いたかは下の過去メモにある）。 -->
		{#if conclusion && hasConclusion}
			<span
				class="flex items-center gap-1 text-[11px] text-muted-foreground"
				title="{conclusion.occurredAt} に付けた札"
			>
				前回
				<TagBadges tags={conclusion.tags} />
			</span>
		{/if}
	</div>
{/if}
