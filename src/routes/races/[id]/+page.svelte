<script lang="ts">
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ActualFlow from '$lib/components/ActualFlow.svelte';
	import AnswerCheck from '$lib/components/AnswerCheck.svelte';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import JockeyLink from '$lib/components/JockeyLink.svelte';
	import JockeyTagBadges from '$lib/components/JockeyTagBadges.svelte';
	import RaceLaps from '$lib/components/RaceLaps.svelte';
	import Last3fBadge from '$lib/components/Last3fBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import RaceFlowDetails from '$lib/components/RaceFlowDetails.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import SexAgeBadge from '$lib/components/SexAgeBadge.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { toast } from 'svelte-sonner';
	import { answerCheck } from '$lib/utils/answer';
	import {
		currentEntry,
		EMPTY_LIVE,
		hasMemo,
		liveOf,
		withField,
		type LiveEntries
	} from '$lib/utils/entry-fields';
	import { horseNoteDigest, raceReviewSaveLabel, savedMessage } from '$lib/utils/note';
	import { raceGoing, raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import { actualFlow, corner4Positions, last3fRanks } from '$lib/utils/run-stats';
	import { isAdmin } from '$lib/utils/role';
	import RacePanels from '$lib/components/RacePanels.svelte';
	import RaceInformation from '$lib/components/RaceInformation.svelte';
	import EntryNoteEditor from '$lib/components/EntryNoteEditor.svelte';
	import EntryMemo from '$lib/components/EntryMemo.svelte';
	import HorseNoteContext from '$lib/components/HorseNoteContext.svelte';
	import PastRuns from '$lib/components/PastRuns.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
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
	// 頭数は予想画面と同じく、取得元の fieldSize があるときだけ末尾に足す（登録行数からは作らない）。
	const spec = $derived(
		raceSpec(data.race, data.race.fieldSize !== null ? [`${data.race.fieldSize}頭`] : [])
	);
	// 馬場状態・天候は条件の下の段に出す（ふりかえりだけ。予想の時点では決まらない）。
	const going = $derived(raceGoing(data.race));

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

	const ta = 'mt-1 text-sm';

	/**
	 * このレースで、画面で入力しているふりかえりの本文・札（保存前を含む）。行に出すメモを、
	 * 保存済みの値ではなくいま入力している値から出すために持つ（予想画面と同じ仕組み。pages.md 3）。
	 * 下書きの復元・hydration 前の入力の書き戻しも、欄に `input` / `change` を投げるので同じ経路で入る。
	 * 保存が通ったら空に戻し、保存済みの値（`data`）に任せる。別レースのものは無いものとして扱う。
	 */
	let live = $state<LiveEntries>(EMPTY_LIVE);
	/**
	 * いま入力欄を開いている行（出走馬の id → 開いているか）。入力欄は閉じていても DOM に残るので、これは見た目だけの状態。
	 * 保存が通ったら全部閉じて書いたメモの表示に戻し、別のレースへ移っても空に戻す（`live` と同じ扱い）。
	 */
	let editingRows = $state<Record<string, boolean>>({});
	/**
	 * 別のレースへ移ったら、入力の控えを空に戻す。フォームの中身は `{#key data.race.id}` で作り直され、
	 * 欄は保存済みの値に戻るため。戻さないと、A → B → A と戻ったときに、欄に無い古い入力が行に出る。
	 * 最初の1回は戻さない（hydration 前の入力の書き戻しを消さないため）。
	 */
	let liveFor = '';
	$effect.pre(() => {
		const id = data.race.id;
		if (liveFor && liveFor !== id) {
			live = EMPTY_LIVE;
			editingRows = {};
		}
		liveFor = id;
	});
	const liveEntries = $derived(liveOf(live, data.race.id));

	/**
	 * 本文・札の欄が変わったとき、いまの入力に反映する。**捕捉フェーズ（capture）で聞く。**
	 * 下書きの書き戻し（DraftKeeper）が欄に投げる `input` / `change` は泡立たないので、泡立ちを待つとフォームに届かない。
	 */
	function onField(e: Event) {
		const el = e.target;
		if (!formEl || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
		live = withField(live, data.race.id, el.name, formEl.elements);
	}
</script>

<svelte:head><title>{data.race.name ?? data.race.course} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<RaceHeading
		{meeting}
		name={data.race.name}
		grade={data.race.grade}
		startTime={data.race.startTime}
		{spec}
		{going}
		{links}
	/>

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

	<!-- 1画面・1送信でレース1本分のふりかえりが完結する（pages.md）。 -->
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
					// 保存が通ったら、入力した本文・札は保存済みの値になった。以降は data に任せる。
					// 送信中に書き足した分は、下の clear が欄へ書き戻すときの input / change で入り直す。
					if (result.type === 'success') {
						live = EMPTY_LIVE;
						editingRows = {};
					}
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
		oninputcapture={onField}
		onchangecapture={onField}
		tabindex="-1"
		class="mt-8 outline-none"
	>
		<DraftKeeper bind:this={keeper} bind:dirtyCount form={formEl} storageKey={draftKey} />
		{#key data.race.id}
			<RacePanels label="ふりかえり">
				{#snippet information()}
					<RaceInformation
						race={data.race}
						graded={data.graded}
						today={data.today}
						sameCondition={data.sameCondition}
					/>
				{/snippet}
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

				<section
					class={answers.length > 0 || actual || (data.race.laps?.length ?? 0) > 0
						? 'mt-6'
						: undefined}
				>
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

					<div class="flex items-center gap-x-1">
						<h2 class="text-sm font-semibold text-gray-500">レースのメモ</h2>
						<InfoTip label="レースのメモ" text="ペース、馬場、展開など「レースの性質」" />
					</div>
					<Textarea
						name="raceNoteBody"
						rows={3}
						aria-label="レースのメモ"
						placeholder="前半緩くて上がり勝負。内有利。"
						class={ta}
						value={data.myRaceNote?.body ?? ''}
					/>
				</section>

				{#if data.rows.length > 0}
					<section class="mt-8">
						<h2 class="text-sm font-semibold text-gray-500">出走馬</h2>

						<!-- 出走馬は1枚の枠に、区切り線で行を並べる（予想画面と同じ）。 -->
						<div class="mt-2 overflow-hidden rounded-xl border">
							<ul class="divide-y">
								{#each rows as r (r.entryId)}
									{@const digest = horseNoteDigest(r.history, r.pastRuns, data.race.date)}
									{@const preview = r.myPreview}
									{@const review = currentEntry(liveEntries, r.entryId, r.myNote)}
									{@const hasPreview = !!preview && hasMemo(preview)}
									{@const hasReview = hasMemo(review)}
									<li id="entry-{r.entryId}" class="scroll-mt-4 p-3">
										<div class="flex items-start gap-x-2 text-sm">
											<!-- 左は折り返す中身、右は印の固定の列。印は幅しだいで次の行へ落とさず、どの行でも1段目の右端にそろえる。 -->
											<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
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
													<span
														class="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
													>
														<JockeyLink
															name={r.jockey}
															summary={r.jockeySummary}
															class="inline-flex min-h-6 max-w-full items-center text-gray-600 underline decoration-dotted underline-offset-2 hover:decoration-solid"
														/>
														<JockeyTagBadges tags={r.jockeyCourseTags} />
													</span>
												{/if}
												{#if r.finishTime}<span class="font-mono text-xs text-gray-500"
														>{r.finishTime}</span
													>{/if}
												{#if r.margin}<span class="text-xs text-gray-500">{r.margin}</span>{/if}
											</div>
											<!-- 印の場所は、印が無くても取っておく（予想画面と同じ）。 -->
											<span class="flex size-6 shrink-0">
												<MarkBadge mark={r.myPreview?.mark ?? null} />
											</span>
										</div>

										<!-- 走りを読むための数字。着順と上りのタイムだけでは「前で粘ったのか、
						     後ろから届いたのか」「上りが速かったのか」が読めない。
						     スマホで1行に収まるよう、1行目とは分けて小さく出す。 -->
										{#if r.corner4 !== null || r.last3f !== null || r.popularity}
											<p
												class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
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

										<!-- 詳細情報は予想画面と同じ。行の直下に畳む。 -->
										<details class="group/detail mt-1">
											<summary
												class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
												><span
													><span class="sr-only">{r.horseName}の</span
													>詳細情報（メモ・直近5走）</span
												><ChevronDown
													class="size-4 shrink-0 group-open/detail:rotate-180"
												/></summary
											>
											<div class="grid gap-3 pb-2">
												<HorseNoteContext
													horseId={r.horseId}
													notes={digest.recent}
													moreCount={digest.moreCount}
													jockey={r.jockey}
													summary={r.jockeySummary}
												/>
												<div class="rounded-lg bg-muted/50 p-3"><PastRuns runs={r.pastRuns} /></div>
											</div>
										</details>

										<!-- 走る前にこの馬をどう見ていたか。**読むだけ**（直すのは予想画面）。
									     印は見出しにある。本文も札も無いときは出さない。 -->
										{#if hasPreview && preview}
											<div class="mt-1">
												<EntryMemo kind="出走前" body={preview.body} tags={preview.tags} />
											</div>
										{/if}

										<!-- いま入力しているふりかえりのメモを、札付きでそのまま出す。押すとその場で入力欄が開く（見出しで折りたためる）。 -->
										{#snippet memo()}
											<EntryMemo kind="ふりかえり" body={review.body} tags={review.tags} />
										{/snippet}

										<EntryNoteEditor
											label="ふりかえりメモ"
											horseName={r.horseName}
											hasMemo={hasReview}
											bind:editing={
												() => !!editingRows[r.entryId], (v) => (editingRows[r.entryId] = v)
											}
											{memo}
										>
											<Textarea
												name="body.{r.entryId}"
												rows={2}
												aria-label="{r.horseName}のメモ"
												placeholder="直線で外に出してから一完歩が速い。"
												class="text-sm"
												value={r.myNote?.body ?? ''}
											/>
											<TagPicker name="tags.{r.entryId}" values={r.myNote?.tags ?? []} />
										</EntryNoteEditor>
									</li>
								{/each}
							</ul>
						</div>
					</section>
				{/if}
			</RacePanels>
		{/key}
		<SaveBar
			{dirtyCount}
			label={raceReviewSaveLabel(data.rows.length)}
			pending={saving}
			message={form && 'message' in form ? form.message : null}
		/>
	</form>
</main>
