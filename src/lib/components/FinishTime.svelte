<script lang="ts">
	import { isRecordTime } from '#lib/utils/course-records.ts';

	/**
	 * 走破タイム。JRA のレコードタイム表と日付・場・馬場・距離・タイムが一致する走りは、
	 * 黒地に白文字にする（新聞の馬柱の黒地白抜き。外で決まった見せ方なので、トークンにせずダークモードでも反転させない）。
	 * 読み上げと `title` は「レコード」。
	 */
	let {
		time,
		date,
		course,
		surface,
		distance,
		class: className
	}: {
		time: string;
		date: string;
		course: string;
		surface: string | null;
		distance: number | null;
		class?: string;
	} = $props();

	const record = $derived(isRecordTime({ date, course, surface, distance, finishTime: time }));
</script>

<span
	class={['font-mono', record && 'rounded-sm bg-black px-1 text-white', className]}
	title={record ? 'レコード' : undefined}>{time}</span
>{#if record}<span class="sr-only">（レコード）</span>{/if}
