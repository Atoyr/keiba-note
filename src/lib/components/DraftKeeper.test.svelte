<script lang="ts">
	import DraftKeeper from './DraftKeeper.svelte';
	import RaceFlowEditor from './RaceFlowEditor.svelte';
	import MarkPicker from './MarkPicker.svelte';
	import TagPicker from './TagPicker.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { predictionDraftToFields } from '$lib/utils/prediction-draft';
	import type { PredictionDraft } from '$lib/schemas/prediction-draft';

	let { storageKey }: { storageKey: string } = $props();
	let form = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	let dirtyCount = $state(0);
	export async function apply(draft: PredictionDraft) {
		await keeper?.apply(predictionDraftToFields(draft));
	}
</script>

<form bind:this={form} onsubmit={(e) => e.preventDefault()}>
	<DraftKeeper bind:this={keeper} bind:dirtyCount {form} {storageKey} />
	<Textarea name="raceNoteBody" value="人間の見立て" />
	<Textarea name="body.e1" value="人間のメモ" />
	<MarkPicker name="mark.e1" value="○" />
	<TagPicker name="tags.e1" values={['次走買い']} />
	<RaceFlowEditor
		horses={[{ entryId: 'e1', horseName: 'ホースA', horseNumber: 1, bracket: 1 }]}
		value={null}
		leadsRight={false}
	/>
</form>
<output>{dirtyCount}</output>
