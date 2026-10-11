<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils';

	/**
	 * 見出しの右に置く、補足の説明。info アイコンのボタンで、マウスは hover、タッチはタップ（クリック）で開く。
	 *
	 * Tooltip にしないのは、Tooltip はタップで開かないため。Popover の `openOnHover` は
	 * タッチの pointer を無視するので、スマホはタップ、マウスは hover で開き、端末の判定は自分で書かない。
	 * 説明は補足なので、hydration 前（JS が動く前）にボタンが動かなくても許容する。
	 * 中には読むものだけを置き、操作は入れない。
	 */
	let {
		label,
		text,
		class: className = ''
	}: {
		/** 見出しの名前。ボタンと枠の名前は「{label}の説明」になる。 */
		label: string;
		/** 説明の文。 */
		text: string;
		class?: string;
	} = $props();
</script>

<Popover.Root>
	<Popover.Trigger
		openOnHover
		openDelay={200}
		aria-label="{label}の説明"
		class={cn(
			'-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
			className
		)}
	>
		<InfoIcon class="size-3.5" aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Content
		role="dialog"
		aria-label="{label}の説明"
		collisionPadding={8}
		class="w-auto max-w-xs text-xs leading-relaxed"
	>
		<p>{text}</p>
	</Popover.Content>
</Popover.Root>
