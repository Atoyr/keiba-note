<script lang="ts">
	import { resolve } from '$app/paths';
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
	 * **まとめが無い（null）ときは今までどおりのただのリンク**で、Tooltip で包まない
	 * （空のツールチップや「まだありません」は出さない）。スマホには hover が無いので、タップで騎手の画面へ行く。
	 */
	let {
		name,
		summary,
		class: className = ''
	}: {
		name: string;
		summary: { body: string; tags: JockeyTag[] } | null;
		/** `<a>` に付ける。出す画面ごとに並び方が違う。 */
		class?: string;
	} = $props();

	const href = $derived(resolve('/jockeys/[name]', { name: jockeyParam(name) }));
	const body = $derived(summary?.body.trim() ?? '');
	// 本文が空で札だけのまとめは札だけ出す。どちらも無ければ浮かべるものが無い。
	const hasSummary = $derived(body !== '' || (summary?.tags.length ?? 0) > 0);
</script>

{#if summary && hasSummary}
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
				{#if body}
					<p class="line-clamp-6 leading-relaxed whitespace-pre-wrap">{body}</p>
				{/if}
				<JockeyTagBadges tags={summary.tags} />
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	<a {href} class={className}>{name}</a>
{/if}
