<script lang="ts">
	/**
	 * 馬のプロフィールの札。並びは 性齢 → 父 → 母 → 調教師 で、値の無い項目は出さない（全部無ければ何も描かない）。
	 * 性齢は `牡4`（馬齢は `currentYear - birthYear`）。性だけなら `牡`、馬齢だけなら `4歳`。
	 * ラベルと値の組なので `dl` で組み、読み上げで「父 ○○」と対になるようにする。性齢は札の字だけで伝わるので
	 * ラベルは読み上げ専用（sr-only）。
	 * 性別や血統に色の意味は無いので、塗らずに罫線と `bg-muted` の札で出す（`JockeyTagBadges` と同じ考え方）。
	 */
	let {
		sex,
		birthYear,
		currentYear,
		sire,
		dam,
		trainer,
		class: className = ''
	}: {
		sex: '牡' | '牝' | 'セ' | null;
		birthYear: number | null;
		currentYear: number;
		sire: string | null;
		dam: string | null;
		trainer: string | null;
		class?: string;
	} = $props();

	const sexAge = $derived.by(() => {
		const age = birthYear ? currentYear - birthYear : null;
		if (sex && age !== null) return `${sex}${age}`;
		if (sex) return sex;
		if (age !== null) return `${age}歳`;
		return null;
	});

	const labelled = $derived(
		[
			{ label: '父', value: sire },
			{ label: '母', value: dam },
			{ label: '調教師', value: trainer }
		].filter((i): i is { label: string; value: string } => Boolean(i.value))
	);

	const chip =
		'inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs';
</script>

{#if sexAge || labelled.length > 0}
	<dl class="flex flex-wrap items-center gap-1.5 {className}">
		{#if sexAge}
			<div class={chip}>
				<dt class="sr-only">性齢</dt>
				<dd class="font-medium text-foreground">{sexAge}</dd>
			</div>
		{/if}
		{#each labelled as item (item.label)}
			<div class={chip}>
				<dt class="text-muted-foreground">{item.label}</dt>
				<dd class="font-medium text-foreground">{item.value}</dd>
			</div>
		{/each}
	</dl>
{/if}
