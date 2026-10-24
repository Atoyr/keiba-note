<script lang="ts" module>
	/** 馬柱の表示の設定を残す localStorage のキー。予想とふりかえり・レース間で共有する。 */
	export const PAST_RUNS_STRIP_KEY = 'uma-memo:past-runs-strip';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils';

	/**
	 * 馬柱の帯（`PastRunsStrip`）を出すかのトグル。md（768px）以上だけ見える。
	 * 状態は localStorage に残す。private モードなどで投げるので、読み書きは握り潰す（DraftKeeper と同じ）。
	 * 読むのは onMount。URL には載せない（DraftKeeper の離脱確認を誘わない）。
	 * JS が動いてから出す責任は呼ぶ側（hydration の後に描く）が持つ。
	 */
	let { pressed = $bindable(false), class: className }: { pressed?: boolean; class?: string } =
		$props();

	onMount(() => {
		try {
			pressed = localStorage.getItem(PAST_RUNS_STRIP_KEY) === '1';
		} catch {
			// 読めなければ既定（OFF）のまま。
		}
	});

	function toggle() {
		pressed = !pressed;
		try {
			if (pressed) localStorage.setItem(PAST_RUNS_STRIP_KEY, '1');
			else localStorage.removeItem(PAST_RUNS_STRIP_KEY);
		} catch {
			// 残せなくても、この画面では切り替わる。
		}
	}
</script>

<div class={cn('hidden rounded-md bg-muted p-0.5 md:flex', className)}>
	<Button
		type="button"
		variant="ghost"
		size="sm"
		aria-pressed={pressed}
		class={cn(
			'h-7 px-2.5 text-xs',
			// 並び順の切り替えと同じ見た目。選んでいない側も text-foreground（bg-muted の上の muted は 4.5:1 に届かない）。
			pressed
				? 'bg-background font-semibold text-foreground shadow-xs hover:bg-background'
				: 'font-normal text-foreground'
		)}
		onclick={toggle}
	>
		馬柱を表示
	</Button>
</div>
