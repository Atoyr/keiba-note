<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * レコードの走破タイムの色。黒地に白文字（新聞の馬柱の黒地白抜き。指示が頼んだ見せ方で、意味の色ではない）。
	 * トークンにせず、ダークモードでも反転させない（design-system.md 第7章）。
	 */
	const finishTime = tv({
		base: 'font-mono',
		variants: { record: { true: 'rounded-sm bg-black px-1 text-white' } }
	});
</script>

<script lang="ts">
	/**
	 * 走破タイム。JRA の結果で「レコード」と書かれた走り（`race_entry.record`）は、黒地に白文字にする。
	 * 読み上げと `title` は「レコード」。
	 */
	let {
		time,
		record = false,
		class: className
	}: {
		time: string;
		record?: boolean;
		class?: string;
	} = $props();
</script>

<span class={[finishTime({ record }), className]} title={record ? 'レコード' : undefined}
	>{time}</span
>{#if record}<span class="sr-only">（レコード）</span>{/if}
