<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils';
	let {
		label,
		children,
		information,
		extra,
		initial = 0,
		onselect
	}: {
		label: string;
		children: Snippet;
		information: Snippet;
		/** ふりかえりとレース情報の間に挟むタブ（ふりかえり画面の「気づき」）。無ければ2枚。 */
		extra?: { label: string; content: Snippet };
		/** 最初に開くタブの番号。 */
		initial?: number;
		/** タブを切り替えたとき。 */
		onselect?: (index: number) => void;
	} = $props();
	/** タブの名前の並び。パネルの番号もこの順（extra が無ければ 0: 本体、1: レース情報）。 */
	const names = $derived([label, ...(extra ? [extra.label] : []), 'レース情報']);
	const infoIndex = $derived(names.length - 1);
	// 最初に開くタブだけを決める値。あとから変わっても切り替えない。
	let active = $state(untrack(() => (initial >= 0 && initial < names.length ? initial : 0)));
	let tabs = $state<HTMLDivElement>();
	function move(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const last = names.length - 1;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? last
					: event.key === 'ArrowRight'
						? (active + 1) % names.length
						: (active + last) % names.length;
		select(next);
		tabs?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[active]?.focus();
	}
	/** タブを選ぶ（親が `bind:this` で呼ぶこともある。履歴から戻ったときのタブの復元）。 */
	export function select(index: number) {
		if (index === active) return;
		active = index;
		onselect?.(index);
	}
</script>

<!-- タブは SSR から描き、選んでいるパネルだけを SSR から出す（JS が動いてから隠すと、一瞬ぜんぶ並んで下の一覧がずれる）。
     JS が無いと押しても切り替わらないので、そのときだけタブを隠し、隠れたパネルも出す（全パネルが縦に並ぶ）。 -->
<svelte:head>
	<noscript
		><style>
			.race-tablist {
				display: none !important;
			}
			@layer base {
				.race-panel[hidden] {
					display: block !important;
				}
			}
		</style></noscript
	>
</svelte:head>
<div
	bind:this={tabs}
	role="tablist"
	aria-label="レースの表示"
	class="race-tablist mb-4 flex border-b"
>
	{#each names as name, index (name)}
		<Button
			type="button"
			role="tab"
			id="race-tab-{index}"
			aria-controls="race-panel-{index}"
			aria-selected={active === index}
			tabindex={active === index ? 0 : -1}
			variant="ghost"
			class={cn(
				// 下線のタブ。選んだタブの 2px の線を、tablist の下線に重ねる（-mb-px）。
				'-mb-px h-auto min-h-11 rounded-none border-0 border-b-2 px-4 hover:bg-transparent dark:hover:bg-transparent',
				active === index
					? 'border-primary font-semibold text-primary hover:text-primary'
					: 'border-transparent text-muted-foreground hover:text-foreground'
			)}
			onclick={() => select(index)}
			onkeydown={move}>{name}</Button
		>
	{/each}
</div>
<!-- DOM を取り除かない。隠れた入力も FormData と DraftKeeper が拾い、一括保存に含める。 -->
<div
	id="race-panel-0"
	class="race-panel"
	role="tabpanel"
	aria-label={label}
	aria-labelledby="race-tab-0"
	tabindex="0"
	hidden={active !== 0}
>
	{@render children()}
</div>
{#if extra}
	<div
		id="race-panel-1"
		class="race-panel"
		role="tabpanel"
		aria-label={extra.label}
		aria-labelledby="race-tab-1"
		tabindex="0"
		hidden={active !== 1}
	>
		{@render extra.content()}
	</div>
{/if}
<div
	id="race-panel-{infoIndex}"
	role="tabpanel"
	aria-label="レース情報"
	aria-labelledby="race-tab-{infoIndex}"
	tabindex="0"
	hidden={active !== infoIndex}
	class="race-panel mt-6"
>
	{@render information()}
</div>
