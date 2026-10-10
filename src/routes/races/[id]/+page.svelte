<script lang="ts">
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ActualFlow from '$lib/components/ActualFlow.svelte';
	import AnswerCheck from '$lib/components/AnswerCheck.svelte';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import CourseMap from '$lib/components/CourseMap.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import GradedRaceTrend from '$lib/components/GradedRaceTrend.svelte';
	import JockeyLink from '$lib/components/JockeyLink.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import RaceLaps from '$lib/components/RaceLaps.svelte';
	import Last3fBadge from '$lib/components/Last3fBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import RaceFlowDetails from '$lib/components/RaceFlowDetails.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import SexAgeBadge from '$lib/components/SexAgeBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { toast } from 'svelte-sonner';
	import { answerCheck } from '$lib/utils/answer';
	import { raceReviewSaveLabel, savedMessage } from '$lib/utils/note';
	import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import { actualFlow, corner4Positions, last3fRanks } from '$lib/utils/run-stats';
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

	// 見出しの `⋯` メニューの項目。並びは予想画面の見出しと同じ（向こうの画面への導線が先、管理者の編集が後）。
	const links = $derived([
		{ href: resolve('/races/[id]/summary', { id: data.race.id }), label: '予想をまとめて見る' },
		...(isGraded(data.race.grade) && data.race.name
			? [
					{
						href: resolve('/graded-races/[name]', {
							name: gradedRaceParam(gradedRaceKey(data.race.name))
						}),
						label: '重賞のタイムライン'
					}
				]
			: []),
		{ href: resolve('/races/[id]/preview', { id: data.race.id }), label: '予想（過去メモを見る）' },
		...(admin
			? [{ href: resolve('/races/[id]/entries', { id: data.race.id }), label: '出走馬を編集' }]
			: [])
	]);

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

	// 4コーナーの位置と上りの順位。上りの順位は走った全頭で数えるので、行ごとには出せない
	// （全頭の上りがそろっていないレースでは順位を出さない。→ last3fRanks）。
	const rows = $derived.by(() => {
		const ranks = last3fRanks(data.rows, data.race.fieldSize);
		// 直線のレース・通過順が途中で切れた中止の馬は4角の位置を持たない（→ corner4Positions）。
		const corners = corner4Positions(data.rows, data.race);
		return data.rows.map((r) => ({
			...r,
			corner4: corners.get(r.entryId) ?? null,
			last3fRank: ranks.get(r.entryId) ?? null
		}));
	});

	// 4角とゴール前の実際の隊列。予想で展開を置いていなくても出す（走った全頭がそろったレースだけ）。
	const actual = $derived(actualFlow(data.rows, data.race));
	/** 実際の展開が予想の隊列を並べる局面。見立ての閉じた行には重ねて出さない。 */
	const shownInActual = $derived(
		(['corner4', 'finish'] as const).filter((p) => actual?.[p] && data.myRaceFlow?.[p].spots.length)
	);

	const ta =
		'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-gray-900 focus:outline-none';
</script>

<svelte:head><title>{data.race.name ?? data.race.course} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<RaceHeading {meeting} name={data.race.name} grade={data.race.grade} {spec} {links} />

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

	<!-- 実際の展開は答え合わせのすぐ下。予想を置いていたら同じ欄で見比べる。 -->
	{#if actual}
		<div class="mt-6">
			<ActualFlow {actual} predicted={data.myRaceFlow} />
		</div>
	{/if}

	<!-- ラップは実際の展開の続き（どう流れたか → どんなペースだったか）。
	     出走馬がそろっていなくても出せる（レース全体の値）。 -->
	{#if data.race.laps && data.race.laps.length > 0}
		<!-- 実際の展開のすぐ下なら続きとして詰め、実際の展開が無いときはほかの欄と同じ間隔にする。 -->
		<div class={actual ? 'mt-3' : 'mt-6'}>
			<RaceLaps
				laps={data.race.laps}
				distance={data.race.distance}
				predictedPace={data.myRaceFlow?.pace ?? null}
			/>
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
		<!-- 重賞ごとの傾向。**読むだけ。** 「レースのメモ」の上に置く。毎年共通のメモで、このレースのメモではない。 -->
		{#if data.gradedTrend}
			<GradedRaceTrend raceKey={data.gradedTrend.key} body={data.gradedTrend.body} class="mb-4" />
		{/if}
		<section>
			<!-- 開催前に書いた見立てを上に置く。**読むだけ。** 結果を見たあとで
			     書き換えられると、事前と事後を別の行にした意味が無くなる。
			     直したいときは予想画面へ戻る。 -->
			{#if data.myRacePreview?.body || data.myRaceFlow}
				<div class="mb-4 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
					<p class="text-xs font-semibold text-sky-900">開催前の見立て</p>
					{#if data.myRacePreview?.body}
						<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-sky-950">
							{data.myRacePreview.body}
						</p>
					{/if}
					<!-- 展開の予想は盤面が場所を取るので畳んでおく。結果と見比べたいときに開く。 -->
					{#if data.myRaceFlow}
						<!-- 白い面に載せる。空色の面の上だと、隊列の補足の灰色が 4.5:1 に届かない。 -->
						<div class="mt-1 rounded-md bg-background px-2 py-1">
							<!-- 実際の展開の欄が予想の隊列を並べている局面（4角・ゴール前）は、閉じた行に重ねて出さない。 -->
							<RaceFlowDetails
								flow={data.myRaceFlow}
								level="h3"
								titleClass="text-xs"
								hideDigest={shownInActual}
							/>
						</div>
					{/if}
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
			<textarea
				name="raceNoteBody"
				rows="3"
				aria-label="レースのメモ"
				placeholder="前半緩くて上がり勝負。内有利。"
				class={ta}>{data.myRaceNote?.body ?? ''}</textarea
			>
		</section>

		{#if data.rows.length > 0}
			<section class="mt-8">
				<h2 class="text-sm font-semibold text-gray-500">出走馬</h2>
				<p class="text-xs text-gray-500">
					本文も札も空のままにするとメモは保存されません（既存メモは消えます）
				</p>

				<ul class="mt-2 space-y-5">
					{#each rows as r (r.entryId)}
						<li class="border-t border-gray-200 pt-3">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
								{#if r.finishPosition}
									<span class="font-bold">{r.finishPosition}着</span>
								{/if}
								<!-- 枠と馬番は1つの札（予想画面と同じ）。この画面の並びは着順なので、
								     枠の色が無いと「内の馬で決まったのか」がひと目で読めない。 -->
								<!-- 札・性齢・馬名は折り返さない1組にする。別々に並べると、
								     狭い幅で馬名だけが次の行へ落ち、性齢が馬名の左から離れる。 -->
								<span class="flex min-w-0 items-baseline gap-2">
									<HorseNumberBadge bracket={r.bracket} horseNumber={r.horseNumber} />
									<!-- 馬詳細と同じ性齢の札（牡4）。性で色を分ける。 -->
									<SexAgeBadge sex={r.sex} label={r.sexAge} />
									<a
										href={resolve('/horses/[id]', { id: r.horseId })}
										class="min-w-0 font-medium hover:underline"
									>
										{r.horseName}
									</a>
								</span>
								<!-- 騎手の画面へ。予想画面と同じく、下線（点線）を常に出してリンクと分かるようにする。 -->
								{#if r.jockey}
									<JockeyLink
										name={r.jockey}
										summary={r.jockeySummary}
										class="inline-flex min-h-6 items-center text-gray-600 underline decoration-dotted underline-offset-2 hover:decoration-solid"
									/>
								{/if}
								{#if r.finishTime}<span class="font-mono text-xs text-gray-500">{r.finishTime}</span
									>{/if}
								{#if r.margin}<span class="text-xs text-gray-500">{r.margin}</span>{/if}
								<span class="flex-1"></span>
								<MarkBadge mark={r.myPreview?.mark ?? null} />
							</div>

							<!-- 走りを読むための数字。着順と上りのタイムだけでは「前で粘ったのか、
							     後ろから届いたのか」「上りが速かったのか」が読めない。
							     スマホで1行に収まるよう、1行目とは分けて小さく出す。 -->
							{#if r.corner4 !== null || r.last3f !== null || r.popularity}
								<p
									class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
								>
									{#if r.corner4 !== null}
										<span
											>4角{r.corner4}番手{#if r.finishPosition}→{r.finishPosition}着{/if}</span
										>
									{/if}
									<Last3fBadge last3f={r.last3f} rank={r.last3fRank} />
									{#if r.popularity}<span>{r.popularity}人気</span>{/if}
								</p>
							{/if}

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
								aria-label="{r.horseName}のメモ"
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
