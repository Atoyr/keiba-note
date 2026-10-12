<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	let { label, children, information }: { label: string; children: Snippet; information: Snippet } =
		$props();
	let hydrated = $state(false);
	let active = $state(0);
	let tabs = $state<HTMLDivElement>();
	onMount(() => {
		hydrated = true;
	});
	function move(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		active = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - active;
		tabs?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[active]?.focus();
	}
</script>

<!-- タブは SSR から描く。JS が動いてから出すと、出た瞬間に下の一覧がタブの高さだけ下へずれる。
     JS が無いと押しても切り替わらないので、そのときだけ隠す（パネルは JS が無いと両方出る）。 -->
<svelte:head>
	<noscript
		><style>
			.race-tablist {
				display: none !important;
			}
		</style></noscript
	>
</svelte:head>
<div
	bind:this={tabs}
	role="tablist"
	aria-label="レースの表示"
	class="race-tablist mb-4 flex gap-2 border-b pb-2"
>
	{#each [label, 'レース情報'] as name, index (name)}
		<Button
			type="button"
			role="tab"
			id="race-tab-{index}"
			aria-controls="race-panel-{index}"
			aria-selected={active === index}
			tabindex={active === index ? 0 : -1}
			variant={active === index ? 'default' : 'ghost'}
			onclick={() => (active = index)}
			onkeydown={move}>{name}</Button
		>
	{/each}
</div>
<!-- DOM を取り除かない。隠れた入力も FormData と DraftKeeper が拾い、一括保存に含める。 -->
<div
	id="race-panel-0"
	role="tabpanel"
	aria-label={label}
	aria-labelledby="race-tab-0"
	tabindex="0"
	hidden={hydrated && active !== 0}
>
	{@render children()}
</div>
<div
	id="race-panel-1"
	role="tabpanel"
	aria-label="レース情報"
	aria-labelledby="race-tab-1"
	tabindex="0"
	hidden={hydrated && active !== 1}
	class="mt-6"
>
	{@render information()}
</div>
