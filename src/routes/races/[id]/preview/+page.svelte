<script lang="ts">
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import CourseMap from '$lib/components/CourseMap.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import GradedRaceTrend from '$lib/components/GradedRaceTrend.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import PastRuns from '$lib/components/PastRuns.svelte';
	import RaceFlowEditor from '$lib/components/RaceFlowEditor.svelte';
	import SexAgeBadge from '$lib/components/SexAgeBadge.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import MarkPicker from '$lib/components/MarkPicker.svelte';
	import JockeyLink from '$lib/components/JockeyLink.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { byMark } from '$lib/utils/answer';
	import { courseMap } from '$lib/utils/course';
	import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import {
		conditionLabel,
		latestConclusion,
		noteHeading,
		previewSaveLabel,
		savedMessage
	} from '$lib/utils/note';
	import {
		formatOddsAsOf,
		formatPlaceOdds,
		formatWinOdds,
		sortByPopularity
	} from '$lib/utils/odds';
	import { flowLeadsRight } from '$lib/utils/race-flow';
	import { isAdmin } from '$lib/utils/role';
	import { cn } from '$lib/utils';
	import { registerPredictionTools } from '$lib/webmcp/prediction';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	// 下書きの置き場。レースとユーザーで分ける。
	let formEl = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	/** 未保存の変更の件数（DraftKeeper が数える）。0 のあいだは保存ボタンを出さない。 */
	let dirtyCount = $state(0);
	/** 送信中。保存ボタンを押せなくする。 */
	let saving = $state(false);
	const draftKey = $derived(`uma-memo:draft:preview:${page.data.user?.id ?? '-'}:${data.race.id}`);

	// 見出しはふりかえりと同じ関数で組む（行き来しても同じレースの見出しに見えるように）。
	// 頭数は予想で見比べるときに使うので、出走馬がいるときだけ末尾に足す。
	const spec = $derived(raceSpec(data.race, data.rows.length > 0 ? [`${data.rows.length}頭`] : []));

	// 見出しの `⋯` メニューの項目。並びはふりかえりの見出しと同じ（向こうの画面への導線が先、管理者の編集が後）。
	// 開催前は、ふりかえりが書けない（開いても戻される）ので導線も出さない。
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
		...(!data.upcoming
			? [{ href: resolve('/races/[id]', { id: data.race.id }), label: 'ふりかえりを書く' }]
			: []),
		...(admin
			? [{ href: resolve('/races/[id]/entries', { id: data.race.id }), label: '出走馬を編集' }]
			: [])
	]);

	/** 展開している馬。1頭ずつ開く。 */
	let open = $state<string | null>(null);

	const ta = 'mt-1 text-sm';

	// 保存済みの印を印の順（◎ → ×）に。ふりかえりの答え合わせと同じ並び。
	const marked = $derived(
		byMark(
			data.rows.map((r) => ({
				entryId: r.entryId,
				horseName: r.horseName,
				horseNumber: r.horseNumber,
				mark: r.myPreview?.mark ?? null
			}))
		)
	);

	// 「京都 芝2200m」。同じ条件の過去メモの見出しに使う。
	const condition = $derived(conditionLabel(data.race));

	// コース図を出せるレースか（JRA の10場で、馬場が決まっている）。印と2列に並べるかを決める。
	const hasCourse = $derived(courseMap(data.race) !== null);

	/**
	 * 出走馬の並び。既定は馬番順で、オッズが取れていれば人気順にも切り替えられる。
	 * **URL には載せない。** クエリを変えるとアプリ内の移動になり、書きかけがあると
	 * DraftKeeper が「離れますか？」と止めてしまう。並べ替えは離脱ではない。
	 * 行は entryId で key を付けてあるので、並べ替えても書きかけの欄や開いた欄はそのまま動く。
	 */
	let order = $state<'number' | 'popularity'>('number');
	const ORDERS = [
		{ value: 'number', label: '馬番順' },
		{ value: 'popularity', label: '人気順' }
	] as const;
	const rows = $derived(order === 'popularity' ? sortByPopularity(data.rows) : data.rows);

	/** 切り替えは JS が要るので、動くようになってから出す（JS が無いと押しても何も起きない）。 */
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	// SvelteKit は別レースでもページを再利用する。race.id ごとに古い登録を abort する。
	$effect(() => {
		if (!hydrated || !keeper || !formEl) return;
		const editor = keeper;
		const raceId = data.race.id;
		return registerPredictionTools({
			getData: () => data,
			getFields: () => editor.snapshot(),
			applyFields: (values) => editor.apply(values),
			isCurrent: () => data.race.id === raceId,
			onApplied: () =>
				// 反映直後も、下端の未保存件数と保存ボタンを読めるよう上部へ出す。
				toast.success('AIの予想を下書きに反映しました。保存前に内容を確認してください', {
					position: 'top-center'
				})
		});
	});
</script>

<svelte:head><title>{data.race.name ?? data.race.course} 予想 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<RaceHeading
		meeting={raceMeeting(data.race)}
		name={data.race.name}
		grade={data.race.grade}
		{spec}
		{links}
	/>

	<!-- 見出しのすぐ下に、付けた印とコースを並べる。広い画面では左に印・右にコース、
	     スマホでは縦に積み、コースは畳んでおく（CourseMap）。片方しか無ければ全幅にする。
	     枠の高さは中身に合わせる（そろえると、印が1〜2頭のとき左の枠の大半が空く）。 -->
	{#if marked.length > 0 || hasCourse}
		<div
			class="mt-4 grid items-start gap-4 {marked.length > 0 && hasCourse ? 'sm:grid-cols-2' : ''}"
		>
			<!-- 付けた印の一覧。16頭の中から「どれに◎を打ったか」を探さずに済むように。
		     並びと色はふりかえりの答え合わせと同じ。押すとその馬の行へ飛ぶ。
		     画面の幅によらず1頭1行にする（横に詰めると、◎→○→▲の順が折り返しで追いにくい）。
		     馬番は幅をそろえて右寄せにし、1行ずつ並べたときに馬名の頭がそろうようにする。 -->
			{#if marked.length > 0}
				<section aria-labelledby="marks-heading" class="rounded-lg border px-3 py-2">
					<h2 id="marks-heading" class="text-xs font-semibold text-muted-foreground">付けた印</h2>
					<ul class="mt-1 grid gap-y-1">
						{#each marked as m (m.entryId)}
							<li>
								<a
									href="#entry-{m.entryId}"
									class="flex items-center gap-1.5 text-sm hover:underline"
								>
									<MarkBadge mark={m.mark} />
									<span class="w-4 text-right font-mono text-xs text-muted-foreground"
										>{m.horseNumber ?? '−'}</span
									>
									{m.horseName}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<CourseMap race={data.race} />
		</div>
	{/if}

	<!-- 保存に失敗したときの文は、JS があれば保存ボタンの横に出す（SaveBar）。ここは JS が無いときだけ。 -->
	{#if form && 'message' in form && form.message}
		<noscript>
			<p
				class="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
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
				class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
			>
				<!-- 件数は出さない。JS が無いと変えたメモを数えられず、未保存の件数も出ていない。 -->
				保存しました
			</p>
		</noscript>
	{/if}

	<!-- **出走馬がいなくてもフォームを出す。** 出馬表が出る前の重賞に
	     「このレースを狙う」と書き留める先が要る。書けるのは見立て1本だけになる。 -->
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
		class="mt-6 outline-none"
	>
		<DraftKeeper bind:this={keeper} bind:dirtyCount form={formEl} storageKey={draftKey} />

		<!-- 重賞ごとの傾向。見立てを書く手元に、読むだけで置く（このレースのメモではなく毎年共通のメモ）。
		     並びはふりかえりと同じ（重賞の傾向 → 見立て → レースのメモ）。 -->
		{#if data.gradedTrend}
			<GradedRaceTrend raceKey={data.gradedTrend.key} body={data.gradedTrend.body} class="mb-6" />
		{/if}

		<!-- レース全体の見立て。**ふりかえりの「レースのメモ」とは別の行**なので、
		     開催後にふりかえりを書いてもここに書いたものは残る。
		     見出しを別の名前にしてあるのは、同じ名前だと同じ欄に見えるため。 -->
		<section>
			<h2 class="text-sm font-semibold text-muted-foreground">レースの見立て</h2>
			<p class="text-xs text-muted-foreground">
				馬場の想定、狙いどころ。ふりかえりとは別に残ります
			</p>
			<Textarea
				name="raceNoteBody"
				rows={3}
				placeholder="開幕週で内有利になりそう。前に行ける馬から。"
				class={ta}
				value={data.myRaceNote?.body ?? ''}
			/>

			<!-- 展開の予想。盤面に馬を置くので、出走馬がいるときだけ出す。
			     見続けるものではないので畳んでおき、閉じた行にペースと隊列の1行だけを出す。 -->
			{#if data.rows.length > 0}
				<div class="mt-3">
					<RaceFlowEditor
						horses={data.rows.map((r) => ({
							entryId: r.entryId,
							horseNumber: r.horseNumber,
							bracket: r.bracket,
							horseName: r.horseName
						}))}
						value={data.myFlow}
						leadsRight={flowLeadsRight(data.race)}
					/>
				</div>
			{/if}

			<!-- 同じ舞台で前に自分が何を見たか。見立てを書く手元に置く。
			     レース名ではなく条件で束ねるので、去年の同じレースも同じ舞台の別のレースも出る。 -->
			{#if data.sameCondition.length > 0}
				<div class="mt-3">
					<h3 class="text-xs font-semibold text-muted-foreground">
						同じ条件（{condition}）で書いたレースのメモ
					</h3>
					<ol class="mt-1 grid gap-2">
						{#each data.sameCondition as n (n.id)}
							{@const h = noteHeading({ kind: 'race', ...n })}
							<li class="border-l-2 pl-3">
								<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
									<span class="font-mono">{n.occurredAt}</span>
									<a href={resolve('/races/[id]', { id: n.raceId })} class="hover:underline">
										{h.label}
									</a>
								</p>
								<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		</section>

		{#if data.rows.length === 0}
			<div class="mt-6 rounded-xl border p-5">
				<p class="text-sm text-muted-foreground">
					出走馬がまだ登録されていません。出馬表が入ると、ここに1頭ずつ並びます。
				</p>
				{#if admin}
					<Button
						href={resolve('/races/[id]/entries', { id: data.race.id })}
						variant="outline"
						size="sm"
						class="mt-3"
					>
						出走馬を入力する
					</Button>
				{/if}
			</div>
		{:else}
			<!-- 取れた時点を必ず添える。30分おきにしか取らず、失敗した回は前の値が残るので、
			     「現在の」オッズのようには見せない（product.md 第6章）。 -->
			{#if data.oddsAsOf}
				<!-- min-h-8 は切り替えの高さ。切り替えは JS が動いてから出るので、先に高さを取っておかないと
				     出た瞬間に一覧が下へずれる。 -->
				<div class="mt-6 flex min-h-8 flex-wrap items-center justify-between gap-2">
					<p class="text-xs text-muted-foreground">
						単勝・複勝のオッズは {formatOddsAsOf(data.oddsAsOf)}
					</p>
					<!-- 並び順。オッズが無ければ人気も無いので、オッズがあるときだけ出す。 -->
					{#if hydrated}
						<div class="flex gap-1 rounded-md bg-muted p-0.5" role="group" aria-label="並び順">
							{#each ORDERS as o (o.value)}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-pressed={order === o.value}
									class={cn(
										'h-7 px-2.5 text-xs',
										// 選んでいない側も text-foreground（bg-muted の上の muted は 4.5:1 に届かない）。
										order === o.value
											? 'bg-background font-semibold text-foreground shadow-xs hover:bg-background'
											: 'font-normal text-foreground'
									)}
									onclick={() => (order = o.value)}
								>
									{o.label}
								</Button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<ul class="{data.oddsAsOf ? 'mt-2' : 'mt-6'} grid gap-2">
				{#each rows as r (r.entryId)}
					{@const hasPreview = !!r.myPreview?.body || (r.myPreview?.tags.length ?? 0) > 0}
					{@const conclusion = latestConclusion(r.history)}
					<li
						id="entry-{r.entryId}"
						class="scroll-mt-4 rounded-xl border p-3 {r.myPreview?.mark === '◎'
							? 'border-red-300 bg-red-50/40'
							: ''}"
					>
						<!-- 見出しの行は、縦に2段の列を横に4つ並べた表にする。
						     札（枠・馬番 / 性齢）| 名前（馬名 / 騎手 / 前回の札）| オッズ（人気・単勝 / 複勝）| 印。
						     - 列の幅は札・オッズ・印を固定して、残りを名前の列に渡す。取消で値が無い馬や桁の違う馬でも、
						       上下の行と位置がずれない（レイアウトシフトも起きない）。
						     - 馬名と騎手は折り返さず（truncate）、1行に収める。スマホ（390px）でも全角9文字が
						       切れずに入る幅を名前の列に残す。入らない幅では … で切る。
						     - 各列の1段目・2段目は高さ 24px（h-6 / leading-6 / min-h-6）、段の間はどの列も gap-1 にして、
						       段を列どうしでそろえる。前回の札があるときだけ、名前の列が3段目の分だけ伸びる。
						     - 見える「単勝」「複勝」の文字は外した。スマホの1段目に文字を置く幅が無いため。
						       値の形（単勝は1つの数・複勝は幅）と一覧の上の「単勝・複勝のオッズは…時点」で見分けられる。
						       読み上げには sr-only で残す。
						     - DOM の順は読む順（札 → 馬名 → 騎手 → 前回の札 → 人気 → 単勝 → 複勝 → 印）。 -->
						<div class="flex items-start gap-x-1.5">
							<!-- 札の列（w-11 は枠・馬番の札の幅）。枠と馬番は1つの札にする（馬番の面は枠の色を薄くしたもの）。
							     ふりかえり画面と同じ札にして、予想で見た枠と結果で見る枠が別物に見えないようにする。
							     その下に性齢の札（馬詳細と同じ。牡4）を置く。
							     枠順が出る前（札が無い）は幅を取らない。空の列が馬名を右へ押し出さないように。 -->
							{#if r.bracket || r.horseNumber || r.sexAge}
								<span
									class="flex shrink-0 flex-col items-start gap-1 {r.bracket || r.horseNumber
										? 'w-11'
										: ''}"
								>
									<HorseNumberBadge bracket={r.bracket} horseNumber={r.horseNumber} />
									<span class="flex h-6 items-center">
										<SexAgeBadge sex={r.sex} label={r.sexAge} />
									</span>
								</span>
							{/if}

							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<a
									href={resolve('/horses/[id]', { id: r.horseId })}
									class="max-w-full self-start truncate leading-6 font-medium hover:underline"
								>
									{r.horseName}
								</a>
								<!-- 騎手の画面へ。予想の最中に「この騎手はどう乗ってきたか」を騎乗とメモから見返す。
								     スマホには hover が無いので、下線（点線）を常に出してリンクと分かるようにする。 -->
								{#if r.jockey}
									<JockeyLink
										name={r.jockey}
										summary={r.jockeySummary}
										class="min-h-6 max-w-full self-start truncate text-sm leading-6 text-muted-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
									/>
								{/if}
								<!-- この馬について最後に下した結論。16頭を見比べるときは本文まで読めないので、
								     札だけを見出しに上げる（何を書いたかは下の過去メモにある）。折り返してよい。 -->
								{#if conclusion}
									<span
										class="flex items-center gap-1 text-[11px] text-muted-foreground"
										title="{conclusion.occurredAt} に付けた札"
									>
										前回
										<TagBadges tags={conclusion.tags} />
									</span>
								{/if}
							</div>

							<!-- オッズ。列の幅を固定する（w-21 = 84px）。1段目は人気（w-10）と単勝（w-9。nnn.n が入る）、
							     2段目は複勝（nn.n - nn.n が入る）で、どれも右に寄せる。
							     取消の馬（人気も値も無い）も空のセルで幅を保つ。 -->
							{#if data.oddsAsOf}
								<div
									class="flex w-21 shrink-0 flex-col items-end gap-1 text-xs leading-6 font-medium text-foreground"
								>
									<span class="flex justify-end gap-x-1.5">
										<span class="w-10 text-right">
											{#if r.popularity}{r.popularity}人気{/if}
										</span>
										<span class="w-9 text-right font-mono">
											<span class="sr-only">単勝</span>{formatWinOdds(r.odds?.winOdds ?? null)}
										</span>
									</span>
									<span class="text-right font-mono whitespace-nowrap">
										<span class="sr-only">複勝</span>{formatPlaceOdds(
											r.odds?.placeOddsMin ?? null,
											r.odds?.placeOddsMax ?? null
										)}
									</span>
								</div>
							{/if}

							<!-- 印の場所は、印が無くても取っておく。印の有無でオッズの位置が変わらないように。 -->
							<span class="flex size-6 shrink-0">
								<MarkBadge mark={r.myPreview?.mark ?? null} />
							</span>
						</div>

						<!-- 馬柱は薄い面に載せて、下に続く「自分のメモ」と見分けられるようにする。
						     どちらも小さい文字の塊なので、囲いが無いと1つの塊に見える。
						     面は半透明なので、下に不透明な bg-background を敷く。敷かないと ◎ の行の赤みが透けて、
						     補足の文字（text-muted-foreground）のコントラストが 4.5:1 を割る（4.48:1）。 -->
						<div class="mt-1.5 ml-7 rounded-md bg-background">
							<div class="rounded-md bg-muted/50 px-2.5 py-1">
								<PastRuns runs={r.pastRuns} />
							</div>
						</div>

						{#if r.history.length > 0}
							<ol class="mt-2 ml-7 grid gap-2">
								{#each r.history.slice(0, open === r.entryId ? undefined : 2) as n (n.id)}
									{@const h = noteHeading(n)}
									<li class="border-l-2 pl-3">
										<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
											<span class="font-mono">{n.occurredAt}</span>
											<KindBadge label={h.kindLabel} />
											<span>{h.label}</span>
											<SharedBadge visibility={n.visibility} />
										</p>
										{#if n.body}
											<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
										{/if}
										<TagBadges tags={n.tags} class="mt-1" />
									</li>
								{/each}
							</ol>

							{#if r.history.length > 2}
								<Button
									type="button"
									variant="link"
									size="sm"
									class="ml-5 h-auto p-0 text-xs"
									onclick={() => (open = open === r.entryId ? null : r.entryId)}
								>
									{open === r.entryId ? '閉じる' : `もっと見る（残り ${r.history.length - 2} 件）`}
								</Button>
							{/if}
						{/if}

						<div class="mt-3 ml-7">
							<MarkPicker name="mark.{r.entryId}" value={r.myPreview?.mark ?? null} />

							<!-- 書いた出走前メモは畳まない。**畳むのは書く側だけ**にする。
							     16頭ぶん並ぶ画面で1頭ずつ開かないと自分の見解が読めないのでは、
							     馬を見比べるという予想画面の用が足りない。
							     開いていないときに出すのは本文と**付けた札だけ**で、
							     選んでいない札（`TagPicker` の全選択肢）は伏せておく。
							     `<details>` のままなのは JS 無効でも開けるため（product.md 第6章）。 -->
							<details class="group mt-2">
								<summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
									{#if hasPreview}
										<!-- 開いている間は下の入力欄が正なので、同じ文を二重に見せない。 -->
										<span class="block group-open:hidden">
											<!-- 改行を保つので、テンプレート側の字下げを入れないよう1行で書く。 -->
											{#if r.myPreview?.body}<span
													class="block text-sm leading-relaxed whitespace-pre-wrap"
													>{r.myPreview.body}</span
												>{/if}
											<TagBadges tags={r.myPreview?.tags ?? []} class="mt-1" />
										</span>
										<span
											class="text-xs text-muted-foreground underline-offset-2 group-open:hidden hover:underline"
										>
											書き直す
										</span>
									{:else}
										<span
											class="text-xs text-muted-foreground underline-offset-2 group-open:hidden hover:underline"
										>
											＋ 出走前メモ
										</span>
									{/if}
									<span
										class="hidden text-xs text-muted-foreground underline-offset-2 group-open:inline hover:underline"
									>
										閉じる
									</span>
								</summary>
								<Textarea
									name="body.{r.entryId}"
									rows={2}
									placeholder="今回は内枠が向きそう。"
									class="mt-1 text-sm"
									value={r.myPreview?.body ?? ''}
								/>
								<div class="mt-1.5">
									<TagPicker name="tags.{r.entryId}" values={r.myPreview?.tags ?? []} />
								</div>
							</details>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<SaveBar
			{dirtyCount}
			label={previewSaveLabel(data.rows.length)}
			pending={saving}
			message={form && 'message' in form ? form.message : null}
		/>
	</form>
</main>
