<script lang="ts">
	// QuickReviewRow は開閉も本文も親が持つ。単体テスト用に、それを持つだけの親。
	import QuickReviewRow from './QuickReviewRow.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		body: initial = '',
		onbody,
		...props
	}: Omit<ComponentProps<typeof QuickReviewRow>, 'open' | 'body' | 'onchange'> & {
		body?: string;
		onbody?: (body: string) => void;
	} = $props();
	let open = $state(false);
	// svelte-ignore state_referenced_locally
	let body = $state(initial);
</script>

<QuickReviewRow
	{...props}
	{body}
	bind:open
	onchange={(_id, next) => {
		body = next;
		onbody?.(next);
	}}
/>
