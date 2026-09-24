<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	/**
	 * レースページの見出し。
	 *
	 * 1行目は「開催（日付・場・R）＋レース名」で、**折り返さない**。
	 * 幅が足りないときに … で詰まるのはレース名だけで、開催は最後まで出す。
	 * どのレースを開いているかは開催のほうで分かるため。
	 *
	 * 重賞の札は1行目に置かない。スマホ幅だとレース名の長さ次第で札だけが
	 * 2行目に回り、見出しの高さがレースごとに変わってしまうので、
	 * はじめから2行目（スペック行）の先頭に固定する。
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
		{#if name}
			<span class="truncate" title={name}>{name}</span>
		{/if}
	</h1>
	{#if grade || spec}
		<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
			<GradeBadge {grade} />
			{#if spec}
				<span class="truncate">{spec}</span>
			{/if}
		</p>
	{/if}
</div>
