<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import { onMount } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import type { JockeyTag } from '$lib/schemas/jockey';
	import { jockeyParam } from '$lib/utils/jockey';
	import JockeyTagBadges from './JockeyTagBadges.svelte';

	/**
	 * 出走馬の行の騎手名。騎手の画面へのリンクで、自分のまとめ（本文と札）があれば、
	 * 押す（クリック・タップ）と Popover で全文を開く。**端末では分けない**（マウスでもタッチでも同じ）。
	 *
	 * **hover で浮かぶ Tooltip にはしない。** まとめはじっくり読みたいもので、hover で浮かぶものは
	 * 読んでいる途中でマウスが外れると消える。Popover なら押して開き、外を押すか Esc まで残る。
	 * Tooltip の中にはリンクも置けないが、Popover なら「騎手の画面へ」のリンクを中に置ける。
	 * 騎手の画面へは Popover の中のリンクで行く（名前を押して開くものはリンクではないので button にし、
	 * 読み上げも「ボタン・ポップアップあり」になる）。
	 *
	 * hydration 前（SSR と最初の描画）は `<a>` のまま。JS が無い・読み込み前でも騎手の画面へ行けるようにする。
	 *
	 * まとめがあるときは、騎手名の右に notebook-pen のアイコンを出す（出走馬の一覧で、まとめの有無をひと目で分かるようにする）。
	 * アイコンは `aria-hidden` にして名前を変えない。
	 *
	 * **まとめが無い（null）ときは今までどおりのただのリンク**で、Popover で包まない
	 * （空の枠や「まだありません」は出さない。毎回1回多く押させない）。
	 */
	let {
		name,
		summary,
		class: className = ''
	}: {
		name: string;
		summary: { body: string; tags: JockeyTag[] } | null;
		/** `<a>`（hydration 後のまとめありでは `<button>`）に付ける。出す画面ごとに並び方が違う。名前とアイコンを横に並べるので inline-flex にする。 */
		class?: string;
	} = $props();

	const href = $derived(resolve('/jockeys/[name]', { name: jockeyParam(name) }));
	const body = $derived(summary?.body.trim() ?? '');
	// 本文が空で札だけのまとめは札だけ出す。どちらも無ければ浮かべるものが無い。
	const hasSummary = $derived(body !== '' || (summary?.tags.length ?? 0) > 0);

	// SSR と hydration の最初の描画は `<a>` のまま。mounted になってから Popover の button に替える。
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

{#snippet summaryContent()}
	{#if body}
		<!-- スクロールできる領域は、キーボードでもフォーカスしてスクロールできるようにする（Safari は既定でフォーカスできない）。 -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<p
			tabindex="0"
			class="max-h-80 overflow-y-auto leading-relaxed whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-ring"
		>
			{body}
		</p>
	{/if}
	<JockeyTagBadges tags={summary?.tags ?? []} />
{/snippet}

<!-- 名前だけを truncate する。アイコンを同じ要素で切ると、狭い幅で省略記号の向こうに隠れてまとめの有無が分からなくなる。
     呼ぶ側の class は inline-flex（items-center）にする。 -->
{#snippet label(withIcon: boolean)}
	<span class="min-w-0 truncate">{name}</span>
	{#if withIcon}
		<NotebookPenIcon class="ml-0.5 size-3.5 shrink-0" aria-hidden="true" />
	{/if}
{/snippet}

{#if summary && hasSummary && mounted}
	<Popover.Root>
		<Popover.Trigger class="{className} cursor-pointer text-left"
			>{@render label(true)}</Popover.Trigger
		>
		<Popover.Content
			role="dialog"
			aria-label="{name}のメモ"
			collisionPadding={8}
			class="w-auto max-w-sm items-start gap-1.5"
		>
			{@render summaryContent()}
			<a
				{href}
				class="inline-flex min-h-6 items-center gap-0.5 font-medium underline underline-offset-2"
			>
				騎手の画面へ<ChevronRightIcon class="size-4" aria-hidden="true" />
			</a>
		</Popover.Content>
	</Popover.Root>
{:else}
	<a {href} class={className}>{@render label(summary !== null && hasSummary)}</a>
{/if}
