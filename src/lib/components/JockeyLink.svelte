<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import type { JockeyTag } from '$lib/schemas/jockey';
	import { jockeyParam } from '$lib/utils/jockey';
	import JockeyTagBadges from './JockeyTagBadges.svelte';

	/**
	 * 出走馬の行の騎手名。騎手の画面へのリンクで、自分のまとめ（本文と札）があれば
	 * hover・フォーカスでツールチップのように浮かべる。
	 *
	 * **HoverCard（LinkPreview）ではなく Tooltip にしてある。** LinkPreview の trigger は `<a>` に
	 * `role="button"` と `aria-haspopup="dialog"` を付け、リンクがボタンとして読み上げられる。
	 * Tooltip は開いている間だけ `aria-describedby` を足すので、リンクのまま補足を読ませられる。
	 * 中身は読むだけ（操作を持たない）なのでツールチップの役割に合い、Tab のフォーカスでも開いて Esc で閉じる。
	 *
	 * **hover できない端末（`(hover: none)`。スマホ・タブレット）では、Tooltip が開かない**
	 * （bits-ui がタッチの pointer を無視する）うえ、Tooltip の中にはリンクを置けない。
	 * そこでまとめがあるときだけ、騎手名を button（Popover の trigger）にして、タップで同じ中身を Popover で開く。
	 * 騎手の画面へは Popover の中のリンクで行く（「1回目のタップで開き2回目で遷移」は、2回目で遷移することが見えないので採らない）。
	 * タップで開くものはリンクではないので button にし、読み上げも「ボタン・ポップアップあり」になる。
	 *
	 * **まとめが無い（null）ときは今までどおりのただのリンク**で、Tooltip や Popover で包まない
	 * （空のツールチップや「まだありません」は出さない。スマホでも毎回1回多くタップさせない）。
	 */
	let {
		name,
		summary,
		class: className = ''
	}: {
		name: string;
		summary: { body: string; tags: JockeyTag[] } | null;
		/** `<a>`（hover できない端末のまとめありでは `<button>`）に付ける。出す画面ごとに並び方が違う。 */
		class?: string;
	} = $props();

	const href = $derived(resolve('/jockeys/[name]', { name: jockeyParam(name) }));
	const body = $derived(summary?.body.trim() ?? '');
	// 本文が空で札だけのまとめは札だけ出す。どちらも無ければ浮かべるものが無い。
	const hasSummary = $derived(body !== '' || (summary?.tags.length ?? 0) > 0);

	// SSR と hydration の最初の描画は `<a>` のまま（タップすれば騎手の画面へ行く）。
	// MediaQuery はクライアントでは最初から matchMedia を読むので、mounted を待たないと
	// hydration の最初の描画がサーバーの HTML と食い違う。
	const hoverNone = new MediaQuery('(hover: none)', false);
	let mounted = $state(false);
	onMount(() => (mounted = true));
	const tapToOpen = $derived(mounted && hoverNone.current);
</script>

{#snippet summaryContent()}
	{#if body}
		<p class="line-clamp-6 leading-relaxed whitespace-pre-wrap">{body}</p>
	{/if}
	<JockeyTagBadges tags={summary?.tags ?? []} />
{/snippet}

{#if summary && hasSummary}
	{#if tapToOpen}
		<Popover.Root>
			<Popover.Trigger class="{className} cursor-pointer text-left">{name}</Popover.Trigger>
			<Popover.Content
				role="dialog"
				aria-label="{name}のまとめ"
				collisionPadding={8}
				class="w-auto max-w-xs items-start gap-1.5"
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
		<Tooltip.Provider delayDuration={300}>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<!-- trigger の既定は type="button"。`<a>` には付けない（リンクのまま読ませる）。 -->
						{@const linkProps = { ...props, type: undefined }}
						<a {...linkProps} {href} class={className}>{name}</a>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					role="tooltip"
					sideOffset={4}
					collisionPadding={8}
					arrowClasses="hidden"
					class="flex max-w-xs flex-col items-start gap-1.5 bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
				>
					{@render summaryContent()}
				</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	{/if}
{:else}
	<a {href} class={className}>{name}</a>
{/if}
