<script lang="ts">
	// EntryInsight は開閉を親が持つ。単体テスト用に、開閉を持つだけの親。
	import EntryInsight from './EntryInsight.svelte';
	import type { ComponentProps } from 'svelte';

	let props: Omit<ComponentProps<typeof EntryInsight>, 'open'> = $props();
	let open = $state(false);
</script>

<EntryInsight {...props} bind:open />
