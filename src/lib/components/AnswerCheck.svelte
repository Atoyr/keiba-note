<script lang="ts">
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import { inTheMoneyCount, type Answer, type AnswerSource, type Placing } from '$lib/utils/answer';

	/**
	 * ふりかえり画面の答え合わせ。印を付けた馬を印の順に並べ、着順と馬券内／着外を出す。
	 *
	 * 並べ替えと判定は `answerCheck` が持つ。ここは見せ方だけ。
	 * 印を1つも付けていないレースでは何も出さない（呼び出し側で空を渡す）。
	 */
	let {
		answers
	}: {
		answers: Answer<AnswerSource & { entryId: string; horseName: string }>[];
	} = $props();

	const LABEL: Record<Placing, string> = {
		in: '馬券内',
		out: '着外',
		pending: '未確定'
	};

	/**
	 * 言葉は事実（馬券内／着外）のまま、色で読みどおりかを出す。
	 * - ◎○▲△ が馬券内 — 赤（読みどおり）
	 * - × が馬券内 — 琥珀（消した馬に来られた。読み違いとして目立たせる）
	 * - それ以外 — 地の色
	 */
	const tone = (a: (typeof answers)[number]) =>
		a.placing !== 'in'
			? 'text-muted-foreground'
			: a.mark === '×'
				? 'font-medium text-amber-700'
				: 'font-medium text-red-700';

	const count = $derived(inTheMoneyCount(answers));
</script>

{#if answers.length > 0}
	<section aria-labelledby="answer-check-heading" class="rounded-lg border px-3 py-2.5">
		<div class="flex flex-wrap items-baseline gap-x-2">
			<h2 id="answer-check-heading" class="text-sm font-semibold">答え合わせ</h2>
			{#if count}
				<span class="text-xs text-muted-foreground">
					◎○▲△ {count.of}頭中 {count.in}頭 馬券内
				</span>
			{/if}
		</div>
		<p class="text-xs text-muted-foreground">予想で付けた印と着順。3着以内が馬券内</p>
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
						<span
							class="w-12 text-right text-xs {tone(a)}"
							title={a.mark === '×' && a.placing === 'in' ? '消した馬が馬券内' : undefined}
						>
							{LABEL[a.placing]}
						</span>
					</span>
				</li>
			{/each}
		</ol>
	</section>
{/if}
