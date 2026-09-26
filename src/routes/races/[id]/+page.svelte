<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AnswerCheck from '$lib/components/AnswerCheck.svelte';
	import BracketBadge from '$lib/components/BracketBadge.svelte';
	import CourseMap from '$lib/components/CourseMap.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import { answerCheck } from '$lib/utils/answer';
	import { raceReviewSaveLabel, savedMessage } from '$lib/utils/note';
	import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	// 下書きの置き場。レースとユーザーで分ける（同じ端末を2人で使う場合に混ざらないように）。
	let formEl = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	/** 未保存の変更の件数（DraftKeeper が数える）。0 のあいだは保存ボタンを出さない。 */
	let dirtyCount = $state(0);
	/** 送信中。保存ボタンを押せなくする。 */
	let saving = $state(false);
	const draftKey = $derived(`uma-memo:draft:review:${page.data.user?.id ?? '-'}:${data.race.id}`);

	const meeting = $derived(raceMeeting(data.race));
	const spec = $derived(raceSpec(data.race));

	// 予想で付けた印と着順の突き合わせ。印の順（◎ → ×）に並べ直す。
	const answers = $derived(
		answerCheck(
			data.rows.map((r) => ({
				entryId: r.entryId,
				horseName: r.horseName,
				horseNumber: r.horseNumber,
				finishPosition: r.finishPosition,
				mark: r.myPreview?.mark ?? null
			}))
		)
	);

	const ta =
		'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-gray-900 focus:outline-none';
</script>

<svelte:head><title>{data.race.name ?? data.race.course} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<RaceHeading {meeting} name={data.race.name} grade={data.race.grade} {spec} />
	<!-- 灰色の文字だけだと押せると気づかれないので、予想画面の見出しと同じ小さいボタンにする。 -->
	<div class="mt-2 flex flex-wrap gap-2">
		<Button href={resolve('/races/[id]/summary', { id: data.race.id })} variant="outline" size="sm"
			>予想をまとめて見る</Button
		>
		<Button href={resolve('/races/[id]/preview', { id: data.race.id })} variant="outline" size="sm">
			予想（過去メモを見る）
		</Button>
		{#if admin}
			<Button
				href={resolve('/races/[id]/entries', { id: data.race.id })}
				variant="outline"
				size="sm"
			>
				出走馬を編集
			</Button>
		{/if}
	</div>

	<!-- 保存に失敗したときの文は、JS があれば保存ボタンの横に出す（SaveBar）。ここは JS が無いときだけ。 -->
	{#if form && 'message' in form && form.message}
		<noscript>
			<p
				class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
				role="alert"
			>
				{form.message}
			</p>
		</noscript>
	{/if}

	<!-- 保存の知らせはトースト（下の use:enhance）。JS が無いときはトーストが出せないので、ここに出す。 -->
	{#if form && 'savedAt' in form}
		<noscript>
			<p
				class="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
			>
				<!-- 件数は出さない。JS が無いと変えたメモを数えられず、未保存の件数も出ていない。 -->
				保存しました
			</p>
		</noscript>
	{/if}

	<!-- 答え合わせは書く欄より先に置く。何が外れたかを見てから書くほうが、
	     ふりかえりの中身が「次にどうするか」に向く。 -->
	{#if answers.length > 0}
		<div class="mt-6">
			<AnswerCheck {answers} />
		</div>
	{/if}

	<!-- コース図は見返すための資料なので、保存の結果と答え合わせより下、書く欄の直前に置く。 -->
	<CourseMap race={data.race} class="mt-6" />

	{#if data.rows.length === 0}
		<p class="mt-8 rounded-md border border-gray-200 p-4 text-sm text-gray-500">
			出走馬がまだ登録されていません。
			{#if admin}
				<a href={resolve('/races/[id]/entries', { id: data.race.id })} class="underline">
					出走馬を入力する
				</a>
			{/if}
		</p>
	{/if}

	<!-- 1画面・1送信でレース1本分のふりかえりが完結する（product.md 第6章）。 -->
	<form
		method="POST"
		bind:this={formEl}
		use:enhance={() => {
			saving = true;
			// 送った値。送信中に書き足した分を「保存済み」に数えないため（DraftKeeper.clear）。
			const sent = keeper?.snapshot();
			return async ({ result, update }) => {
				try {
					// 送信中に書き足した分も入った、いまの値。update() で欄が描き直される前に取る。
					const late = keeper?.snapshot();
					// **reset: false が必須。** 既定の update() はフォームを reset() するが、
					// Svelte はテキストエリアを .value で更新するので defaultValue は空のまま。
					// リセットすると全欄が空になり、そのあとの再描画では値が変わっていない
					// メモが「変化なし」と判断されて描き直されない。
					// 結果、保存した直後に中身が消えたように見える。
					// このフォームは「空欄＝そのメモを消す」仕様なので、そこでもう一度
					// 保存すると本当に消える。表示はサーバーの data が正で、
					// フォームの初期値ではない。
					await update({ reset: false });
					// 保存が通ったときだけ下書きを捨てる。失敗したら残す
					// （電波が悪くて落ちた場合、書いたものを失わないため）。
					if (result.type === 'success') {
						const changed = (await keeper?.clear(sent, late)) ?? 0;
						toast.success(savedMessage(data.rows.length, changed));
					}
				} finally {
					saving = false;
				}
			};
		}}
		tabindex="-1"
		class="mt-8 outline-none"
	>
		<DraftKeeper bind:this={keeper} bind:dirtyCount form={formEl} storageKey={draftKey} />
		<section>
			<!-- 開催前に書いた見立てを上に置く。**読むだけ。** 結果を見たあとで
			     書き換えられると、事前と事後を別の行にした意味が無くなる。
			     直したいときは予想画面へ戻る。 -->
			{#if data.myRacePreview?.body}
				<div class="mb-4 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
					<p class="text-xs font-semibold text-sky-900">開催前の見立て</p>
					<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-sky-950">
						{data.myRacePreview.body}
					</p>
					<a
						href={resolve('/races/[id]/preview', { id: data.race.id })}
						class="mt-1 inline-block text-xs text-sky-800 underline-offset-2 hover:underline"
					>
						予想画面で直す
					</a>
				</div>
			{/if}

			<h2 class="text-sm font-semibold text-gray-500">レースのメモ</h2>
			<p class="text-xs text-gray-500">ペース、馬場、展開など「レースの性質」</p>
			<textarea name="raceNoteBody" rows="3" placeholder="前半緩くて上がり勝負。内有利。" class={ta}
				>{data.myRaceNote?.body ?? ''}</textarea
			>
		</section>

		{#if data.rows.length > 0}
			<section class="mt-8">
				<h2 class="text-sm font-semibold text-gray-500">出走馬</h2>
				<p class="text-xs text-gray-500">
					本文も札も空のままにするとメモは保存されません（既存メモは消えます）
				</p>

				<ul class="mt-2 space-y-5">
					{#each data.rows as r (r.entryId)}
						<li class="border-t border-gray-200 pt-3">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
								{#if r.finishPosition}
									<span class="font-bold">{r.finishPosition}着</span>
								{/if}
								<!-- 枠は色、馬番は数字で出す。この画面の並びは着順なので、
								     色が無いと「内の馬で決まったのか」がひと目で読めない。 -->
								<BracketBadge bracket={r.bracket} />
								{#if r.horseNumber}
									<span class="font-mono text-gray-500">{r.horseNumber}</span>
								{/if}
								<a
									href={resolve('/horses/[id]', { id: r.horseId })}
									class="font-medium hover:underline"
								>
									{r.horseName}
								</a>
								{#if r.jockey}<span class="text-gray-600">{r.jockey}</span>{/if}
								{#if r.finishTime}<span class="font-mono text-xs text-gray-500">{r.finishTime}</span
									>{/if}
								{#if r.margin}<span class="text-xs text-gray-500">{r.margin}</span>{/if}
								{#if r.last3f}<span class="text-xs text-gray-500">上り{r.last3f}</span>{/if}
								<span class="flex-1"></span>
								<MarkBadge mark={r.myPreview?.mark ?? null} />
							</div>

							<!-- 走る前にこの馬をどう見ていたか。**読むだけ**（直すのは予想画面）。
							     印だけで本文も札も無いときは、右上の印で足りるので枠を出さない。 -->
							{#if r.myPreview && (r.myPreview.body || r.myPreview.tags.length > 0)}
								<div
									class="mt-1.5 rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-1.5 text-sm"
								>
									<KindBadge label="出走前" />
									{#if r.myPreview.body}<span
											class="ml-1 leading-relaxed whitespace-pre-wrap text-sky-950"
											>{r.myPreview.body}</span
										>{/if}
									<TagBadges tags={r.myPreview.tags} class="ml-1" />
								</div>
							{/if}

							<textarea
								name="body.{r.entryId}"
								rows="2"
								placeholder="直線で外に出してから一完歩が速い。"
								class={ta}>{r.myNote?.body ?? ''}</textarea
							>

							<div class="mt-1.5">
								<TagPicker name="tags.{r.entryId}" values={r.myNote?.tags ?? []} />
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<SaveBar
			{dirtyCount}
			label={raceReviewSaveLabel(data.rows.length)}
			pending={saving}
			message={form && 'message' in form ? form.message : null}
		/>
	</form>
</main>
