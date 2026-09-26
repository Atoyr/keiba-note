<script lang="ts">
	/**
	 * 隊列の1行（`⑤-③⑦-⑪①`）。**折り返しは列の切れ目（`-` のあと）でだけ起こす。**
	 * 枠順前は頭2文字の馬名が並ぶので、ふつうに折り返すと馬名の途中で行が変わる（「ケ／ヤコハ」）。
	 */
	let { columns, class: className = '' }: { columns: string[]; class?: string } = $props();
</script>

<span class={className}
	>{#each columns as c, i (i)}{#if i > 0}-<wbr />{/if}<span class="whitespace-nowrap">{c}</span
		>{/each}</span
>
