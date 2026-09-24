<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	/**
	 * レースページの見出し。
	 *
	 * 1行目は「開催（日付・場・R）＋レース名」で、**折り返さない**。
	 * 幅が足りないときに … で詰まるのはレース名だけで、開催は最後まで出す。
	 * どのレースを開いているかは開催のほうで分かるため。
	 *
	 * 格の札は、どの画面とも同じく**レース名の前**に置く（product.md 第6章）。
	 * 札は縮めないので、長い名前でも札が2行目に回ることはなく、詰まるのは名前だけ。
	 */
	let {
		meeting,
		name,
		grade,
		spec
	}: {
		/** 日付・場・R など、詰めずに必ず出す部分。 */
		meeting: string;
		/** レース名。幅が足りなければここが … になる。 */
		name: string | null;
		grade: string | null;
		/** 2行目に出す条件（距離・馬場など）。 */
		spec: string;
	} = $props();
</script>

<div>
	<h1 class="flex items-baseline gap-2 text-lg font-bold tracking-tight sm:text-xl">
		<span class="shrink-0">{meeting}</span>
		{#if grade}
			<!-- 見出しの文字の大きさに引きずられず、ほかの画面と同じ札に見せる。 -->
			<span class="shrink-0 self-center leading-none"><GradeBadge {grade} /></span>
		{/if}
		{#if name}
			<span class="truncate" title={name}>{name}</span>
		{/if}
	</h1>
	{#if spec}
		<p class="mt-1 truncate text-sm text-muted-foreground">{spec}</p>
	{/if}
</div>
