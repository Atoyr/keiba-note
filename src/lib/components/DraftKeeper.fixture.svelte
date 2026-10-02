<script lang="ts">
	import DraftKeeper from './DraftKeeper.svelte';
	import RaceFlowEditor from './RaceFlowEditor.svelte';
	import MarkPicker from './MarkPicker.svelte';
	import TagPicker from './TagPicker.svelte';
	import type { FieldValues } from '$lib/utils/draft';

	let { values }: { values: FieldValues } = $props();
	let form = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	let dirtyCount = $state(0);
	let submitted = $state(0);
</script>

<form
	bind:this={form}
	onsubmit={(event) => {
		event.preventDefault();
		submitted++;
	}}
>
	<DraftKeeper bind:this={keeper} {form} storageKey="test:prediction-draft" bind:dirtyCount />
	<textarea name="body.e1" aria-label="本文">人間の本文</textarea>
	<MarkPicker name="mark.e1" value="○" />
	<TagPicker name="tags.e1" values={['次走買い']} />
	<RaceFlowEditor
		horses={[{ entryId: 'e1', horseNumber: 1, bracket: 1, horseName: 'ホースA' }]}
		value={null}
		leadsRight={false}
	/>
	<button type="button" onclick={() => keeper?.apply(values)}>AI下書きを適用</button>
	<output aria-label="未保存件数">{dirtyCount}</output>
	<output aria-label="送信件数">{submitted}</output>
</form>
