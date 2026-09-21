<script lang="ts">
	/** 期待度。★の数を色で示す。文字だけだと一覧で埋もれるため。 */
	let { rating, class: className = '' }: { rating: number | null; class?: string } = $props();
</script>

{#if rating}
	<span class="text-amber-500 {className}" title="期待度 {rating}/5" aria-label="期待度 {rating}">
		{'★'.repeat(rating)}<span class="text-muted-foreground/30">{'★'.repeat(5 - rating)}</span>
	</span>
{/if}
