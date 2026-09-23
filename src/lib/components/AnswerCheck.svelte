<script lang="ts">
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import type { Answer, AnswerSource, AnswerVerdict } from '$lib/utils/answer';

	/**
	 * ふりかえり画面の答え合わせ。印を付けた馬を印の順に並べ、着順と当たり外れを出す。
	 *
	 * 並べ替えと判定は `answerCheck` が持つ。ここは見せ方だけ。
	 * 印を1つも付けていないレースでは何も出さない（呼び出し側で空を渡す）。
	 */
	let {
		answers
	}: {
		answers: Answer<AnswerSource & { entryId: string; horseName: string }>[];
	} = $props();

	const VERDICT: Record<AnswerVerdict, { label: string; class: string }> = {
		hit: { label: '当たり', class: 'text-red-700 font-medium' },
		miss: { label: '外れ', class: 'text-muted-foreground' },
		pending: { label: '結果待ち', class: 'text-muted-foreground' }
	};

	const hits = $derived(answers.filter((a) => a.verdict === 'hit').length);
	const decided = $derived(answers.filter((a) => a.verdict !== 'pending').length);
</script>

{#if answers.length > 0}
	<section aria-labelledby="answer-check-heading" class="rounded-lg border px-3 py-2.5">
		<div class="flex flex-wrap items-baseline gap-x-2">
			<h2 id="answer-check-heading" class="text-sm font-semibold">答え合わせ</h2>
			{#if decided > 0}
				<span class="text-xs text-muted-foreground">{decided}頭中 {hits}頭 当たり</span>
			{/if}
		</div>
		<p class="text-xs text-muted-foreground">
			予想で付けた印と着順。3着以内で当たり（×は4着以下で当たり）
		</p>
		<ol class="mt-2 grid gap-1">
			{#each answers as a (a.entryId)}
				<li class="flex items-center gap-2 text-sm">
					<MarkBadge mark={a.mark} />
					<span class="w-5 text-right font-mono text-xs text-muted-foreground">
						{a.horseNumber ?? '−'}
					</span>
					<span class="min-w-0 truncate">{a.horseName}</span>
					<span class="ms-auto flex shrink-0 items-baseline gap-2">
						<span class="font-mono {a.finishPosition === 1 ? 'font-bold text-red-700' : ''}">
							{a.finishPosition ? `${a.finishPosition}着` : '—'}
						</span>
						<span class="w-12 text-right text-xs {VERDICT[a.verdict].class}">
							{VERDICT[a.verdict].label}
						</span>
					</span>
				</li>
			{/each}
		</ol>
	</section>
{/if}
