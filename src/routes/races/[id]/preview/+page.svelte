<script lang="ts">
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import PastRuns from '$lib/components/PastRuns.svelte';
	import RaceFlowEditor from '$lib/components/RaceFlowEditor.svelte';
	import SexAgeBadge from '$lib/components/SexAgeBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import MarkPicker from '$lib/components/MarkPicker.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import JockeyLink from '$lib/components/JockeyLink.svelte';
	import JockeyTagBadges from '$lib/components/JockeyTagBadges.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { byMark } from '$lib/utils/answer';
	import {
		currentEntry,
		EMPTY_LIVE,
		hasMemo,
		liveOf,
		withEntry,
		withField,
		type LiveEntries
	} from '$lib/utils/entry-fields';
	import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import {
		horseNoteDigest,
		latestConclusion,
		previewSaveLabel,
		savedMessage
	} from '$lib/utils/note';
	import type { Mark } from '$lib/schemas/note';
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
	import RacePanels from '$lib/components/RacePanels.svelte';
	import RaceInformation from '$lib/components/RaceInformation.svelte';
	import EntryNoteEditor from '$lib/components/EntryNoteEditor.svelte';
	import EntryMemo from '$lib/components/EntryMemo.svelte';
	import HorseNoteContext from '$lib/components/HorseNoteContext.svelte';
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
	// 頭数は登録行数ではなく、取得元の fieldSize があるときだけ末尾に足す。
	const spec = $derived(
		raceSpec(data.race, data.race.fieldSize !== null ? [`${data.race.fieldSize}頭`] : [])
	);

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

	const ta = 'mt-1 text-sm';

	/**
	 * このレースで、画面で入力している印・本文・札（保存前を含む）。行の見出しの印・メモと「付けた印」を、
	 * 保存済みの値ではなくいま入力している値から出すために持つ（pages.md 4-3）。
	 * 印は `MarkPicker` の `onpick` が、本文と札はフォームの `input` / `change`（下の `onField`）が書く。
	 * 下書きの復元・AI の反映・hydration 前の入力の書き戻しも、欄に `input` / `change` を投げるので同じ経路で入る
	 * （`破棄` は欄を変えないので何もしなくてよい）。
	 * 保存が通ったら空に戻し、保存済みの値（`data`）に任せる。
	 * SvelteKit は別レースでもページを再利用するので、レースの id を添えて、違うレースのものは無いものとして扱う。
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
	/** 1頭ぶんの、いま見える印・本文・札。 */
	const noteOf = (r: (typeof data.rows)[number]) =>
		currentEntry(liveEntries, r.entryId, r.myPreview);
	const markOf = (r: (typeof data.rows)[number]): Mark | null => noteOf(r).mark;
	const pick = (entryId: string, mark: Mark | null) =>
		(live = withEntry(live, data.race.id, entryId, { mark }));

	/**
	 * 本文・札の欄が変わったとき、いまの入力に反映する。**捕捉フェーズ（capture）で聞く。**
	 * 下書きの書き戻し（DraftKeeper）が欄に投げる `input` / `change` は泡立たないので、泡立ちを待つとフォームに届かない。
	 */
	function onField(e: Event) {
		const el = e.target;
		if (!formEl || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
		live = withField(live, data.race.id, el.name, formEl.elements);
	}

	// いま選んでいる印を印の順（◎ → ×）に。ふりかえりの答え合わせと同じ並び。
	const marked = $derived(
		byMark(
			data.rows.map((r) => ({
				entryId: r.entryId,
				horseName: r.horseName,
				horseNumber: r.horseNumber,
				mark: markOf(r)
			}))
		)
	);

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
	/** 札の列（枠・馬番・性齢）を出すか。一覧全体で1つに決め、全行の列の幅をそろえる。 */
	const badgeColumn = $derived(data.rows.some((r) => r.bracket || r.horseNumber || r.sexAge));

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

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<RaceHeading
		meeting={raceMeeting(data.race)}
		name={data.race.name}
		grade={data.race.grade}
		startTime={data.race.startTime}
		{spec}
		{links}
	/>

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
					// 保存が通ったら、入力した印・本文・札は保存済みの値になった。以降は data に任せる。
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
		class="mt-6 outline-none"
	>
		<DraftKeeper bind:this={keeper} bind:dirtyCount form={formEl} storageKey={draftKey} />
		{#key data.race.id}
			<RacePanels label="予想">
				{#snippet information()}
					<RaceInformation
						race={data.race}
						graded={data.graded}
						today={data.today}
						sameCondition={data.sameCondition}
					/>
				{/snippet}
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

				<!-- レース全体の見立て。**ふりかえりの「レースのメモ」とは別の行**なので、
		     開催後にふりかえりを書いてもここに書いたものは残る。
		     見出しを別の名前にしてあるのは、同じ名前だと同じ欄に見えるため。 -->
				<section class={marked.length > 0 ? 'mt-6' : undefined}>
					<div class="flex items-center gap-x-1">
						<h2 class="text-sm font-semibold text-muted-foreground">レースの見立て</h2>
						<InfoTip
							label="レースの見立て"
							text="馬場の想定、狙いどころ。ふりかえりとは別に残ります"
						/>
					</div>
					<Textarea
						name="raceNoteBody"
						rows={3}
						aria-label="レースの見立て"
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
			     「現在の」オッズのようには見せない（pages.md）。 -->
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
					<!-- 出走馬は1枚の枠に、区切り線で行を並べる。角の丸みから行の面（◎ の赤）がはみ出さないよう overflow-hidden。 -->
					<div class="{data.oddsAsOf ? 'mt-2' : 'mt-6'} overflow-hidden rounded-xl border">
						<ul class="divide-y">
							{#each rows as r (r.entryId)}
								{@const note = noteOf(r)}
								{@const hasNote = hasMemo(note)}
								{@const conclusion = latestConclusion(r.history)}
								{@const mark = note.mark}
								{@const digest = horseNoteDigest(r.history, r.pastRuns, data.race.date)}
								<li
									id="entry-{r.entryId}"
									class="scroll-mt-4 p-3 {mark === '◎' ? 'ring-1 ring-red-300 ring-inset' : ''}"
								>
									<!-- 見出しの行は、縦に2段の列を横に4つ並べた表にする。
						     札（枠・馬番 / 性齢）| 名前（馬名 / 騎手 / 騎手の札 / 前回の札）| オッズ（人気・単勝 / 複勝）| 印。
						     - 列の幅は札・オッズ・印を固定して、残りを名前の列に渡す。取消で値が無い馬や桁の違う馬でも、
						       上下の行と位置がずれない（レイアウトシフトも起きない）。
						     - 馬名と騎手は折り返さず（truncate）、1行に収める。スマホ（390px）でも全角9文字が
						       切れずに入る幅を名前の列に残す。入らない幅では … で切る。
						     - 各列の1段目・2段目は高さ 24px（h-6 / leading-6 / min-h-6）、段の間はどの列も gap-1 にして、
						       段を列どうしでそろえる。騎手の札（芝巧者など）・前回の札があるときだけ、名前の列がその段の分だけ伸びる。
						     - 騎手の札は騎手の隣ではなく下の段に置く（ふりかえり画面と同じ。人が選んだ）。
						     - 見える「単勝」「複勝」の文字は外した。スマホの1段目に文字を置く幅が無いため。
						       値の形（単勝は1つの数・複勝は幅）と一覧の上の「単勝・複勝のオッズは…時点」で見分けられる。
						       読み上げには sr-only で残す。
						     - DOM の順は読む順（札 → 馬名 → 騎手 → 騎手の札 → 前回の札 → 人気 → 単勝 → 複勝 → 印）。 -->
									<div class="flex items-start gap-x-1.5">
										<!-- 札の列（w-11 は枠・馬番の札の幅）。枠と馬番は1つの札にする（馬番の面は枠の色を薄くしたもの）。
							     ふりかえり画面と同じ札にして、予想で見た枠と結果で見る枠が別物に見えないようにする。
							     その下に性齢の札（馬詳細と同じ。牡4）を置く。
							     札の列を出すかは一覧全体で1つに決める（badgeColumn）。出すなら全行が w-11 で取り、
							     その行に札が無くても幅だけ取る。行ごとに決めると、馬名の位置が行ごとにずれる。
							     枠順も性齢も誰にも無い（札が1つも無い）レースだけ、空の列で馬名を右へ押し出さないよう幅を取らない。 -->
										{#if badgeColumn}
											<span class="flex w-11 shrink-0 flex-col items-start gap-1">
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
								     hover が無い端末でもリンクと分かるよう、下線（点線）を常に出す。 -->
											{#if r.jockey}
												<JockeyLink
													name={r.jockey}
													summary={r.jockeySummary}
													class="inline-flex min-h-6 max-w-full items-center self-start text-sm leading-6 text-muted-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
												/>
												<!-- 騎手の札（芝巧者など）。騎手の下に段を作って出す（ふりかえり画面と同じ）。
									     このレースに合う札が無い騎手は段ごと出さない。 -->
												{#if r.jockeyCourseTags.length > 0}
													<JockeyTagBadges tags={r.jockeyCourseTags} class="min-h-6 self-start" />
												{/if}
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
														<span class="sr-only">単勝</span>{formatWinOdds(
															r.odds?.winOdds ?? null
														)}
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
											<MarkBadge {mark} />
										</span>
									</div>

									<!-- 詳細情報は行の直下（印とメモの上）に畳む。馬のメモ・騎手のメモは常に出すと18頭ぶん縦に伸びる。
									     前回の札は見出し、騎手のまとめは騎手名の枠で読めるので、日常の比較は畳んだままで足りる。 -->
									<details class="group/detail mt-1">
										<summary
											class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
											><span
												><span class="sr-only">{r.horseName}の</span>詳細情報（メモ・直近5走）</span
											><ChevronDown class="size-4 shrink-0 group-open/detail:rotate-180" /></summary
										>
										<div class="grid gap-3 pb-2">
											<HorseNoteContext
												horseId={r.horseId}
												notes={digest.recent}
												moreCount={digest.moreCount}
												jockey={r.jockey}
												summary={r.jockeySummary}
												{conclusion}
											/>
											<div class="rounded-lg bg-muted/50 p-3"><PastRuns runs={r.pastRuns} /></div>
										</div>
									</details>

									<!-- 印は常に出す。行を開かずに付けられる。 -->
									<div class="mt-1">
										<MarkPicker
											name="mark.{r.entryId}"
											label="{r.horseName}の予想印"
											value={r.myPreview?.mark ?? null}
											onpick={(m) => pick(r.entryId, m)}
										/>
									</div>

									<!-- 書いたメモはそのまま出し、押すとその場で入力欄が開く（見出しで折りたためる）。種別の札（出走前）を付ける。
									     無いと、すぐ上の「前回」の札の続きに読める。 -->
									{#snippet memo()}
										<EntryMemo kind="出走前" body={note.body} tags={note.tags} />
									{/snippet}

									<EntryNoteEditor
										label="出走前メモ"
										horseName={r.horseName}
										hasMemo={hasNote}
										bind:editing={
											() => !!editingRows[r.entryId], (v) => (editingRows[r.entryId] = v)
										}
										{memo}
									>
										<Textarea
											name="body.{r.entryId}"
											aria-label="{r.horseName}の出走前メモ"
											rows={2}
											placeholder="今回は内枠が向きそう。"
											class="text-sm"
											value={r.myPreview?.body ?? ''}
										/>
										<TagPicker name="tags.{r.entryId}" values={r.myPreview?.tags ?? []} />
									</EntryNoteEditor>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</RacePanels>
		{/key}
		<SaveBar
			{dirtyCount}
			label={previewSaveLabel(data.rows.length)}
			pending={saving}
			message={form && 'message' in form ? form.message : null}
		/>
	</form>
</main>
