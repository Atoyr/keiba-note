<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import BracketBadge from '$lib/components/BracketBadge.svelte';
	import CourseMap from '$lib/components/CourseMap.svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import PastRuns from '$lib/components/PastRuns.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import MarkPicker from '$lib/components/MarkPicker.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { byMark } from '$lib/utils/answer';
	import { courseMap } from '$lib/utils/course';
	import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
	import { conditionLabel, latestConclusion, noteHeading, previewSaveLabel } from '$lib/utils/note';
	import { formatOddsAsOf, formatPlaceOdds, formatWinOdds } from '$lib/utils/odds';
	import { isAdmin } from '$lib/utils/role';
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

	/** 展開している馬。1頭ずつ開く。 */
	let open = $state<string | null>(null);

	// 出走馬がいないレース（これから組まれる重賞など）では、入力欄は見立て1つだけ。
	// 「（N 件）」は並んでいる馬の数だけ意味を持つ言い方なので出さない。
	const bulk = $derived(data.rows.length > 0);
	// 件数は、この保存で変えたメモの数（`DraftKeeper.clear` が返す）。押す前の「未保存の変更が N 件」と
	// 同じ数え方にする。サーバーの `saved` は空でないメモの総数で、触っていない馬まで数えるので使わない。
	const savedMessage = (changed: number) =>
		`保存しました${bulk && changed > 0 ? `（${changed} 件）` : ''}`;

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
</script>

<svelte:head><title>{data.race.name ?? data.race.course} 予想 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<RaceHeading
		meeting={raceMeeting(data.race)}
		name={data.race.name}
		grade={data.race.grade}
		{spec}
	/>
	<!-- 並びはふりかえりの見出しと同じ（向こうの画面への導線が先、管理者の編集が後）。
	     開催前は、ふりかえりが書けない（開いても戻される）ので導線も出さない。 -->
	<div class="mt-2 flex flex-wrap gap-2">
		<Button href={resolve('/races/[id]/summary', { id: data.race.id })} variant="outline" size="sm"
			>予想をまとめて見る</Button
		>
		{#if !data.upcoming}
			<Button href={resolve('/races/[id]', { id: data.race.id })} variant="outline" size="sm">
				ふりかえりを書く
			</Button>
		{/if}
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

	<!-- 見出しのすぐ下に、付けた印とコースを並べる。広い画面では左に印・右にコース、
	     スマホでは縦に積み、コースは畳んでおく（CourseMap）。片方しか無ければ全幅にする。
	     枠の高さは中身に合わせる（そろえると、印が1〜2頭のとき左の枠の大半が空く）。 -->
	{#if marked.length > 0 || hasCourse}
		<div
			class="mt-4 grid items-start gap-4 {marked.length > 0 && hasCourse ? 'sm:grid-cols-2' : ''}"
		>
			<!-- 付けた印の一覧。16頭の中から「どれに◎を打ったか」を探さずに済むように。
		     並びと色はふりかえりの答え合わせと同じ。押すとその馬の行へ飛ぶ。 -->
			{#if marked.length > 0}
				<section aria-labelledby="marks-heading" class="rounded-lg border px-3 py-2">
					<h2 id="marks-heading" class="text-xs font-semibold text-muted-foreground">付けた印</h2>
					<ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
						{#each marked as m (m.entryId)}
							<li>
								<a
									href="#entry-{m.entryId}"
									class="flex items-center gap-1.5 text-sm hover:underline"
								>
									<MarkBadge mark={m.mark} />
									<span class="font-mono text-xs text-muted-foreground">{m.horseNumber ?? '−'}</span
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
	{#if form && 'saved' in form}
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
						toast.success(savedMessage(changed));
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
				<p class="mt-6 text-xs text-muted-foreground">
					単勝・複勝のオッズは {formatOddsAsOf(data.oddsAsOf)}
				</p>
			{/if}
			<ul class="{data.oddsAsOf ? 'mt-2' : 'mt-6'} grid gap-2">
				{#each data.rows as r (r.entryId)}
					{@const hasPreview = !!r.myPreview?.body || (r.myPreview?.tags.length ?? 0) > 0}
					{@const conclusion = latestConclusion(r.history)}
					<li
						id="entry-{r.entryId}"
						class="scroll-mt-4 rounded-xl border p-3 {r.myPreview?.mark === '◎'
							? 'border-red-300 bg-red-50/40'
							: ''}"
					>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<!-- 枠は色で出す。ふりかえり画面と同じ札にして、
							     予想で見た枠と結果で見る枠が別物に見えないようにする。 -->
							<BracketBadge bracket={r.bracket} />
							<span class="w-6 text-right font-mono text-sm font-medium">
								{r.horseNumber ?? '−'}
							</span>
							<a
								href={resolve('/horses/[id]', { id: r.horseId })}
								class="font-medium hover:underline"
							>
								{r.horseName}
							</a>
							{#if r.jockey}
								<span class="text-sm text-muted-foreground">{r.jockey}</span>
							{/if}
							<!-- この馬について最後に下した結論。16頭を見比べるときは本文まで読めないので、
							     札だけを見出しに上げる（何を書いたかは下の過去メモにある）。 -->
							{#if conclusion}
								<span
									class="flex items-center gap-1 text-[11px] text-muted-foreground"
									title="{conclusion.occurredAt} に付けた札"
								>
									前回
									<TagBadges tags={conclusion.tags} />
								</span>
							{/if}
							<span class="flex-1"></span>
							<MarkBadge mark={r.myPreview?.mark ?? null} />
						</div>

						<!-- オッズは見出しの行に入れず、専用の1行にする。見出しは馬名と騎手の長さで折り返すので、
						     そこに入れると馬ごとに位置が変わり（mobile では前回の札と同じ行に落ちる）、縦に見比べられない。 -->
						{#if data.oddsAsOf}
							<p class="mt-1.5 ml-7 text-xs text-muted-foreground">
								単勝
								<span class="font-mono font-medium text-foreground">
									{formatWinOdds(r.odds?.winOdds ?? null)}
								</span>
								<span class="ml-2">複勝</span>
								<span class="font-mono font-medium text-foreground">
									{formatPlaceOdds(r.odds?.placeOddsMin ?? null, r.odds?.placeOddsMax ?? null)}
								</span>
							</p>
						{/if}

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
