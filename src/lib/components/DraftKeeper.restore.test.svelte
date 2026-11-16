<script lang="ts">
	import DraftKeeper from './DraftKeeper.svelte';

	let { storageKey, onrestore }: { storageKey: string; onrestore: () => void } = $props();
	let form = $state<HTMLFormElement | null>(null);
	let dirtyCount = $state(0);
</script>

<DraftKeeper bind:dirtyCount {form} {storageKey} {onrestore} />
<form bind:this={form} onsubmit={(e) => e.preventDefault()}>
	<textarea name="body"></textarea>
</form>
<output>{dirtyCount}</output>
