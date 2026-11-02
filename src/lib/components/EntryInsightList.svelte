<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import EntryInsight from '$lib/components/EntryInsight.svelte';
	import type { InsightSaver } from '$lib/utils/insight-saver.svelte';

	/**
	 * ふりかえり画面の「気づき」タブの中身。出走馬を1頭1行（`EntryInsight`）で、ふりかえりタブと同じ順に並べる。
	 *
	 * - 開くのは1頭だけ（`openId`）。別の馬を押すと前の馬を閉じる。前の馬が上で閉じると押した行が上へずれるので、
	 *   切り替えの前後で押した行の位置を測り、その差だけスクロールして、押した行を画面の同じ場所に残す。
	 * - 別の馬へ移るとき、前の馬の未送信のメモを送り始める（欄の blur でも送られるが、タップの順に頼らない）。
	 * - 一番上に1行の説明と、言葉の登録・編集へのリンクを1回だけ置く（行ごとには置かない）。
	 *   言葉が0個なら、説明の代わりに登録の案内を出す（自由入力は行を開けば使える）。
	 */
	let {
		rows,
		saver,
		registered,
		formId
	}: {
		rows: {
			entryId: string;
			horseName: string;
			bracket: number | null;
			horseNumber: number | null;
			finishPosition: number | null;
		}[];
		saver: InsightSaver;
		/** 自分が登録した言葉（登録順）。 */
		registered: string[];
		/** 送り先のフォームの id。 */
		formId: string;
	} = $props();

	/** 着順の列を出すかは一覧全体で1つに決める（ふりかえりの一覧と同じ）。 */
	const rankColumn = $derived(rows.some((r) => r.finishPosition !== null));

	/** 札（枠・馬番）の列も一覧全体で1つに決める。出すなら全行が同じ幅を取る。 */
	const badgeColumn = $derived(rows.some((r) => r.bracket || r.horseNumber));

	let openId = $state<string | null>(null);
	async function setOpen(entryId: string, value: boolean) {
		const el = document.getElementById(`insight-${entryId}`);
		if (!value) {
			if (openId === entryId) openId = null;
			return;
		}
		const previous = openId;
		if (previous && previous !== entryId) saver.flushMemo(previous);
		const before = el?.getBoundingClientRect().top;
		openId = entryId;
		if (before === undefined) return;
		await tick();
		const after = el?.getBoundingClientRect().top;
		if (after !== undefined && after !== before) {
			window.scrollBy({ top: after - before, behavior: 'instant' });
		}
		// 下のほうの馬を開いたとき、開いた中（言葉）が画面の下にはみ出すなら、はみ出た分だけ上げる。
		// ただし行の上端は画面の上（scroll-mt-4 相当の 16px）より上に出さない。
		const rect = el?.getBoundingClientRect();
		if (rect) {
			const overflow = rect.bottom - window.innerHeight;
			const room = Math.max(0, rect.top - 16);
			if (overflow > 0 && room > 0) {
				window.scrollBy({ top: Math.min(overflow, room), behavior: 'instant' });
			}
		}
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
	{#if registered.length === 0}
		<p class="text-sm text-muted-foreground">
			よく使う言葉を登録すると、押すだけで残せます。
			<a
				href={resolve('/settings/insight-words')}
				class="inline-flex min-h-6 items-center whitespace-nowrap underline underline-offset-2 hover:decoration-2"
				>言葉を登録する</a
			>
		</p>
	{:else}
		<p class="entry-insight-hint text-xs text-muted-foreground">
			馬を押して、言葉を選ぶだけ。押すと保存されます。
		</p>
		<a
			href={resolve('/settings/insight-words')}
			class="inline-flex min-h-6 items-center text-xs text-muted-foreground underline underline-offset-2 hover:decoration-2"
			>言葉を登録・編集する</a
		>
	{/if}
</div>

<!-- JS が無いと、馬を押す操作は無く（行は開きっぱなし）、言葉を押すと画面が移る。説明は隠して、下の案内に任せる。 -->
<svelte:head>
	<noscript
		><style>
			.entry-insight-hint {
				display: none !important;
			}
		</style></noscript
	>
</svelte:head>

<!-- 気づきの保存は JS が無いと別の画面（結果の画面）へ移る。行ごとには出さず、ここに1回だけ。 -->
<noscript>
	<p class="mt-1 text-xs text-muted-foreground">
		気づきを保存すると画面が移ります。書きかけのふりかえりは先に保存してください。
	</p>
</noscript>

<div class="mt-2 overflow-hidden rounded-xl border">
	<ul class="divide-y">
		{#each rows as r (r.entryId)}
			<li id="insight-{r.entryId}" class="scroll-mt-4">
				<EntryInsight
					horseName={r.horseName}
					entryId={r.entryId}
					{saver}
					{registered}
					{formId}
					bracket={r.bracket}
					horseNumber={r.horseNumber}
					finishPosition={r.finishPosition}
					{rankColumn}
					{badgeColumn}
					bind:open={() => openId === r.entryId, (v) => void setOpen(r.entryId, v)}
				/>
			</li>
		{/each}
	</ul>
</div>
