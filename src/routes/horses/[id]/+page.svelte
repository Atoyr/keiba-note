<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Star from '@lucide/svelte/icons/star';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import * as Select from '#lib/components/ui/select/index.ts';
	import NoteMenu from '#lib/components/NoteMenu.svelte';
	import ShareControl from '#lib/components/ShareControl.svelte';
	import SharedBadge from '#lib/components/SharedBadge.svelte';
	import DraftKeeper from '#lib/components/DraftKeeper.svelte';
	import HorseTraitTagBadges from '#lib/components/HorseTraitTagBadges.svelte';
	import HorseTraitTagPicker from '#lib/components/HorseTraitTagPicker.svelte';
	import InfoTip from '#lib/components/InfoTip.svelte';
	import HorseProfileHeader from '#lib/components/HorseProfileHeader.svelte';
	import InsightView from '#lib/components/InsightView.svelte';
	import KindBadge from '#lib/components/KindBadge.svelte';
	import TagBadges from '#lib/components/TagBadges.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import { HORSE_SEXES, TRAINING_CENTERS, type HorseTraitTag } from '#lib/schemas/horse.ts';
	import { isSettled, opensReview } from '#lib/utils/date.ts';
	import { horseAge } from '#lib/utils/horse.ts';
	import { isReviewNote, noteHeading, raceLabel, runHeading } from '#lib/utils/note.ts';
	import { isAdmin } from '#lib/utils/role.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const startOpen = untrack(() => !!form && 'body' in form);
	const admin = $derived(isAdmin(data.user));

	/**
	 * 特徴メモの入力欄が開いているか。保存が通ったら閉じる（書いたものが読む形で出る）。
	 * 正は `<details>` の `open` で、これはその写し。`bind:open` にしないのは、hydration が
	 * この状態の値（閉）を要素に書き込み、JS が届く前に開いた欄が閉じてしまうため（騎手の画面と同じ）。
	 * キーは `traitBody`（近況メモの `body`・上部の `message` と混ぜない）。
	 */
	const traitHorseId = $derived(data.horse.id);
	/**
	 * 特徴メモの節の状態は、**馬が変わったときだけ**初期値に戻す（同じルートで別の馬へ移ると、
	 * 節は `{#key}` で作り直すが、script の状態は残るため）。中身は untrack で読み、`form` や `data.trait` が
	 * 変わっただけでは作り直さない。どれも書き換えてよい（Svelte 5.25 以降の書き換えられる `$derived`）。
	 *
	 * **`data` を直に読まない。** `data` は load のたびに新しいオブジェクトになるので、`data.horse.id` を読むと
	 * 推しや近況メモの追加で load が読み直されたときに、書き換えた値が初期値へ戻る。プリミティブの `$derived`
	 * （`traitHorseId`）は値が変わったときだけ下流に伝わるので、これを読む。
	 */
	function forHorse<T>(init: () => T): () => T {
		return () => {
			void traitHorseId; // 依存にするのは馬の id だけ。
			return untrack(init);
		};
	}
	/** 失敗で返ってきた画面（JS 無し）では最初から開く。`{#if}` の分岐に使うので書き換えない。 */
	const traitStartOpen = $derived.by(forHorse(() => !!form && 'traitBody' in form));
	let traitEditing = $derived.by(forHorse(() => !!form && 'traitBody' in form));
	let traitPending = $state(false);
	/** 通信・サーバーの失敗の文（無ければ null）。 */
	let traitSaveError = $derived.by(forHorse((): string | null => null));
	/**
	 * 入力欄の値。この画面のローカルな状態にする（推しなど別の action の成功で `form` が置き換わっても、書きかけが `data.trait` に戻らない）。
	 * 初期値は、失敗で返ってきた入力（JS 無し）があればそれ、無ければ保存済みの本文。
	 */
	let traitValue = $derived.by(
		forHorse(() => (form && 'traitBody' in form ? form.traitBody : (data.trait?.body ?? '')))
	);
	/** 札の欄の初期値（チェックボックスは欄のほうが正で、これは最初に付ける印）。失敗で返ってきた札（JS 無し）があればそれ。 */
	let traitTags = $derived.by(
		forHorse((): HorseTraitTag[] =>
			form && 'traitTags' in form && form.traitTags ? form.traitTags : (data.trait?.tags ?? [])
		)
	);
	let traitToggle = $state<HTMLElement>();
	let traitDetails = $state<HTMLDetailsElement>();
	let traitFormEl = $state<HTMLFormElement | null>(null);
	let traitKeeper = $state<DraftKeeper | null>(null);
	let traitDirty = $state(0);
	const traitDraftKey = $derived(
		`uma-memo:draft:horse-trait:${data.user?.id ?? '-'}:${data.horse.id}`
	);

	// hydration の前に開かれていたら、ここで拾う。
	onMount(() => {
		traitEditing = traitDetails!.open;
	});

	// 下書きを復元したら、閉じていれば開いて、復元した値が見えるようにする。
	function openForRestore() {
		if (!traitDetails || traitDetails.open) return;
		traitDetails.open = true;
		traitEditing = true;
	}

	let profileOpen = $state(false);
	let favoritePending = $state(false);
	let deletePending = $state(false);
	let addPending = $state(false);
	let sexValue = $state(data.horse.sex ?? '');
	let centerValue = $state(data.horse.trainingCenter ?? '');

	const input = 'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
</script>

<svelte:head><title>{data.horse.name} — uma-memo</title></svelte:head>

{#snippet heading()}
	<h1 class="min-w-0 text-2xl font-bold tracking-tight">{data.horse.name}</h1>
{/snippet}

<!-- レースの行に添える、そのレース当時の馬齢（レースの年 − 生年）。生年が無ければ出さない。 -->
{#snippet ageAt(date: string)}
	{@const age = horseAge(data.horse.birthYear, date)}
	{#if age !== null}<span class="text-muted-foreground">{age}歳</span>{/if}
{/snippet}

{#snippet actions()}
	<!-- 推しは本人だけのもの（誰が何を推しているかは他人に見えない）。押したボタンが次の状態を送るので、
	     二重に押しても行き来しない。
	     **星だけのボタンにしている**（文字を添えない。色も色名を直に書く。design-system.md 第7章）。
	     今の状態は星の塗り（推しなら★、そうでなければ☆）で、押すと何が起きるかは読み上げと hover の名前
	     （aria-label / title）で出す。輪郭は白い地に 3:1（WCAG 1.4.11）に届く amber-600、塗りは yellow-400。 -->
	<form
		method="POST"
		action="?/favorite"
		use:enhance={({ cancel }) => {
			if (favoritePending) {
				cancel();
				return;
			}
			favoritePending = true;
			return async ({ result, update }) => {
				try {
					await update();
					if (result.type === 'success') {
						toast.success(
							result.data?.favorite
								? '推しにしました。出走予定はダッシュボードに並びます'
								: '推しから外しました'
						);
					}
				} finally {
					favoritePending = false;
				}
			};
		}}
	>
		<input type="hidden" name="favorite" value={data.favorite ? '0' : '1'} />
		<Button
			type="submit"
			variant="ghost"
			size="icon-lg"
			aria-label={data.favorite ? '推しから外す' : '推しにする'}
			title={data.favorite ? '推しから外す' : '推しにする'}
			aria-disabled={favoritePending}
			class="aria-disabled:opacity-50"
		>
			<Star
				class="size-7 text-amber-600 {data.favorite ? 'fill-yellow-400' : ''}"
				aria-hidden="true"
			/>
		</Button>
	</form>
{/snippet}

<main class="mx-auto max-w-3xl px-6 py-8">
	<HorseProfileHeader
		{heading}
		{actions}
		sex={data.horse.sex}
		birthDate={data.horse.birthDate}
		birthYear={data.horse.birthYear}
		currentYear={Number(data.today.slice(0, 4))}
		sire={data.horse.sire}
		dam={data.horse.dam}
		damSire={data.horse.damSire}
		trainer={data.horse.trainer}
		trainingCenter={data.horse.trainingCenter}
	/>
	{#if form && 'favorite' in form}<noscript
			><p class="mt-1 text-sm">
				{form.favorite
					? '推しにしました。出走予定はダッシュボードに並びます。'
					: '推しから外しました。'}
			</p></noscript
		>{/if}

	{#if data.horse.profileMemo}
		<p
			class="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap"
		>
			{data.horse.profileMemo}
		</p>
	{/if}

	<!-- プロフィールは全ユーザー共通のマスタなので、書き換えられるのは admin だけ
	     （product.md 第3章）。一般ユーザーは、自分のメモ（下の節）とタイムラインの近況メモを書ける。 -->
	{#if admin}
		<button
			type="button"
			onclick={() => (profileOpen = !profileOpen)}
			class="mt-2 text-sm text-gray-600 hover:underline"
		>
			{profileOpen ? '閉じる' : 'プロフィールを編集'}
		</button>
	{/if}

	{#if admin && profileOpen}
		<form
			method="POST"
			action="?/saveProfile"
			use:enhance
			class="mt-3 grid grid-cols-2 gap-3 rounded-md border border-gray-200 p-4"
		>
			<div class="text-sm">
				<Label for="profile-sex" class="mb-1">性別</Label>
				<Select.Root type="single" name="sex" bind:value={sexValue}>
					<Select.Trigger id="profile-sex" class="w-full">{sexValue || '—'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="—">—</Select.Item>
						{#each HORSE_SEXES as s (s)}
							<Select.Item value={s} label={s}>{s}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<label class="text-sm">
				<span class="font-medium">生年</span>
				<input type="number" name="birthYear" value={data.horse.birthYear ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">生年月日</span>
				<input type="date" name="birthDate" value={data.horse.birthDate ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">調教師</span>
				<input name="trainer" value={data.horse.trainer ?? ''} class={input} />
			</label>
			<div class="text-sm">
				<Label for="profile-center" class="mb-1">所属</Label>
				<Select.Root type="single" name="trainingCenter" bind:value={centerValue}>
					<Select.Trigger id="profile-center" class="w-full">{centerValue || '—'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="—">—</Select.Item>
						{#each TRAINING_CENTERS as c (c)}
							<Select.Item value={c} label={c}>{c}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<label class="text-sm">
				<span class="font-medium">カナ</span>
				<input name="nameKana" value={data.horse.nameKana ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">父</span>
				<input name="sire" value={data.horse.sire ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">母</span>
				<input name="dam" value={data.horse.dam ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">母父</span>
				<input name="damSire" value={data.horse.damSire ?? ''} class={input} />
			</label>
			<label class="col-span-2 text-sm">
				<span class="font-medium">プロフィールメモ</span>
				<textarea name="profileMemo" rows="2" class={input}>{data.horse.profileMemo ?? ''}</textarea
				>
			</label>
			<div class="col-span-2">
				<button
					type="submit"
					class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
				>
					保存
				</button>
			</div>
		</form>
	{/if}

	<!-- メモ（コードと文書では特徴メモ `horse_trait`。近況メモ・各レースのメモと取り違えないため）。自分だけが読める、この馬についての見立て（1人・1頭に1本。本文と札）。
	     `horse.profileMemo`（上の共通マスタのメモ）とは別。
	     書いたものは畳まず、畳むのは書く側だけ。無いときは「＋ メモを書く」の1行だけを出す（空の枠や説明は出さない）。
	     `<details>` なので JS が無くても開ける。
	     **本文は `<summary>` の外に置く。** 中に入れると、開閉のボタンの読み上げ名が本文全文になる。 -->
	{#key data.horse.id}
		<section class="mt-6" aria-labelledby="horse-trait">
			<div class="flex items-center gap-x-1">
				<h2 id="horse-trait" class="text-sm font-semibold text-muted-foreground">メモ</h2>
				<InfoTip
					label="メモ"
					text="自分だけが読めます。予想とふりかえりの画面で、馬名の下のメモのアイコンを押すと開きます"
				/>
			</div>

			<!-- 復元の帯が閉じた `<details>` の中に隠れないよう、`<details>` の外に置く。閉じていてもフォームの欄は DOM にあるので読める。 -->
			<DraftKeeper
				bind:this={traitKeeper}
				bind:dirtyCount={traitDirty}
				onrestore={openForRestore}
				form={traitFormEl}
				storageKey={traitDraftKey}
			/>

			<div class="mt-2 {data.trait ? 'rounded-md border p-3' : ''}">
				{#if data.trait && !traitEditing}
					<!-- 改行を保つので、テンプレート側の字下げを入れないよう1行で書く。 -->
					{#if data.trait.body}<p class="text-sm leading-relaxed whitespace-pre-wrap">
							{data.trait.body}
						</p>{/if}
					<HorseTraitTagBadges tags={data.trait.tags} class="mt-1" />
				{/if}
				{#snippet traitEditor()}
					<summary
						bind:this={traitToggle}
						class="inline-flex min-h-6 cursor-pointer list-none items-center text-xs text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden {data.trait
							? 'mt-1'
							: ''}"
					>
						<span class="group-open:hidden">{data.trait ? '書き直す' : '＋ メモを書く'}</span>
						<span class="hidden group-open:inline">閉じる</span>
					</summary>

					<form
						bind:this={traitFormEl}
						method="POST"
						action="?/saveTrait"
						class="mt-2 grid gap-3"
						use:enhance={({ cancel }) => {
							if (traitPending) {
								cancel();
								return;
							}
							traitPending = true;
							traitSaveError = null;
							// 送った値。送信中に書き足した分を「保存済み」に数えないため（DraftKeeper.clear）。
							const sent = traitKeeper?.snapshot();
							return async ({ result, update }) => {
								try {
									if (result.type === 'error') {
										// update() を呼ぶとエラー画面に移って入力が消える。入力は残し、もう一度押せるようにする。
										traitSaveError =
											result.status === 404
												? 'この馬が見つかりませんでした。'
												: '保存できませんでした。通信の状態を確かめて、もう一度保存してください。';
										return;
									}
									if (result.type === 'redirect') {
										// セッション切れ。DraftKeeper の確認と下書きが働く。
										await update();
										return;
									}
									const late = traitKeeper?.snapshot();
									// 表示の正はサーバーの data。フォームを初期値に戻すと、描き直されない欄が空に見える
									// （frontend.md 第3章「update({ reset: false })」）。
									await update({ reset: false });
									if (result.type === 'success') {
										traitValue = data.trait?.body ?? '';
										traitTags = data.trait?.tags ?? [];
										// 保存済みにするのは送った値ではなく、サーバーが保存した値（前後の空白を除いたもの）。
										// 送った値のままだと、末尾の改行だけの違いで「未保存」が残り、離脱の確認と下書きが出る。
										// 送信中に書き足した分（送った値と違うとき）だけを書き戻す。
										const saved: Record<string, string[]> = { body: [traitValue] };
										if (traitTags.length > 0) saved.tags = [...traitTags];
										const typedDuringSave =
											late &&
											(late.body?.[0] !== sent?.body?.[0] ||
												(late.tags ?? []).join() !== (sent?.tags ?? []).join())
												? late
												: null;
										await traitKeeper?.clear(saved, typedDuringSave);
										// toggle イベントは後から来るので、traitEditing もここで揃える。
										traitDetails!.open = false;
										traitEditing = false;
										// 押した保存ボタンは閉じた中に消えるので、フォーカスを開閉のボタンへ戻す。
										await tick();
										traitToggle?.focus();
										toast.success(
											result.data?.trait === 'cleared' ? 'メモを消しました' : 'メモを保存しました'
										);
									}
								} finally {
									traitPending = false;
								}
							};
						}}
					>
						<Textarea
							name="body"
							rows={4}
							aria-label="メモの本文"
							placeholder="東京の長い直線向き。右回りでは外に張るので割引。"
							class="text-sm"
							bind:value={traitValue}
						/>
						<HorseTraitTagPicker name="tags" values={traitTags} />
						<p class="text-xs text-muted-foreground">
							本文も札も空にして保存すると、メモは消えます。
						</p>
						<div class="flex flex-wrap items-center gap-3">
							<Button type="submit" aria-disabled={traitPending} class="aria-disabled:opacity-50">
								{traitPending ? '保存中…' : 'メモを保存する'}
							</Button>
							{#if traitSaveError}
								<p class="text-sm text-destructive" role="alert">{traitSaveError}</p>
							{:else if form && 'traitMessage' in form && form.traitMessage}
								<p class="text-sm text-destructive" role="alert">{form.traitMessage}</p>
							{/if}
						</div>
					</form>
				{/snippet}
				<!-- `open={traitStartOpen}` とは書かない。式の `open` は hydration が要素に書き込み、JS が届く前に
			     開いた欄が閉じてしまう。直に書いた属性は hydration で触られないので、属性の有無で2つに分ける。 -->
				{#if traitStartOpen}
					<details
						class="group"
						open
						bind:this={traitDetails}
						ontoggle={() => (traitEditing = traitDetails!.open)}
					>
						{@render traitEditor()}
					</details>
				{:else}
					<details
						class="group"
						bind:this={traitDetails}
						ontoggle={() => (traitEditing = traitDetails!.open)}
					>
						{@render traitEditor()}
					</details>
				{/if}
			</div>
			{#if form && 'trait' in form}<noscript
					><p class="mt-1 text-sm">
						{form.trait === 'cleared' ? 'メモを消しました。' : 'メモを保存しました。'}
					</p></noscript
				>{/if}
		</section>
	{/key}

	<!-- 失敗の文は1か所にまとめる。推し・プロフィール欄・近況メモの追加と削除のどれが失敗しても、
	     タイムラインの上のここに残る（近況メモの削除はメニューの中なので、閉じても見えるように外に置く）。 -->
	{#if form && 'message' in form && form.message}
		<p
			class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if form && 'added' in form}<noscript
			><p class="mt-1 text-sm">近況メモを追加しました</p></noscript
		>{/if}
	{#if form && 'deleted' in form}<noscript
			><p class="mt-1 text-sm">近況メモを削除しました</p></noscript
		>{/if}
	<section class="mt-8">
		<h2 id="horse-timeline" tabindex="-1" class="text-sm font-semibold text-gray-500">
			タイムライン
		</h2>

		{#snippet addEditor()}
			<summary class="cursor-pointer text-sm text-gray-700">＋ 近況メモを追加</summary>
			<form
				method="POST"
				action="?/addNote"
				use:enhance={({ cancel }) => {
					if (addPending) {
						cancel();
						return;
					}
					addPending = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success') {
								await update();
								toast.success('近況メモを追加しました');
							} else await update({ reset: false });
						} finally {
							addPending = false;
						}
					};
				}}
				class="mt-3"
			>
				<textarea
					name="body"
					rows="3"
					required
					aria-label="近況メモ"
					placeholder="北海道滞在。追い切りの動き良いとのこと。"
					class={input}>{form && 'body' in form ? form.body : ''}</textarea
				>
				<div class="mt-2">
					<TagPicker name="tags" values={form && 'tags' in form ? form.tags : []} />
				</div>
				<div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
					<label class="flex items-center gap-1.5">
						日付
						<input
							type="date"
							name="occurredAt"
							value={form && 'occurredAt' in form ? form.occurredAt : data.today}
							class="rounded border border-gray-300 px-2 py-1"
						/>
					</label>
					<Button type="submit" size="sm" aria-disabled={addPending}
						>{addPending ? '処理中…' : '追加'}</Button
					>
				</div>
			</form>
		{/snippet}
		<!-- SSR で開いて返すときは属性の有無を分け、hydration で開閉を上書きしない。 -->
		{#if startOpen}
			<details open class="mt-2 rounded-md border border-gray-200 p-3">
				{@render addEditor()}
			</details>
		{:else}
			<details class="mt-2 rounded-md border border-gray-200 p-3">{@render addEditor()}</details>
		{/if}

		{#if data.timeline.length === 0}
			<p class="mt-4 text-sm text-gray-500">まだメモも出走もありません。</p>
		{:else}
			<!-- 未来 → 過去。次走が先頭、古い走りほど下に沈む（mergeHorseTimeline）。 -->
			<ol class="mt-4 space-y-5">
				{#each data.timeline as row (row.key)}
					{#if row.type === 'run'}
						{@const h = runHeading(row.run, row.upcoming)}
						<!-- メモの無い出走。走った事実だけの行なので、実線ではなく破線で
						     「ここには何も書いていない」ことを見せる。 -->
						<li class="border-l-2 border-dashed border-gray-300 pl-4">
							<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
								<span class="font-mono text-gray-500">{row.occurredAt}</span>
								<KindBadge label={h.kindLabel} />
								<!-- 結果が出たレースだけふりかえりへ。出走予定や結果の投入前は予想画面へ送る。 -->
								<a
									href={isSettled(row.run, data.today)
										? resolve('/races/[id]', { id: row.run.raceId })
										: resolve('/races/[id]/preview', { id: row.run.raceId })}
									class="text-gray-600 hover:underline"
								>
									{h.label}
								</a>
								{@render ageAt(row.occurredAt)}
							</div>
						</li>
					{:else if row.type === 'insight'}
						{@const i = row.insight}
						<!-- レース直後の気づき。ふりかえりのメモとは別の行で、共有・削除のメニューは出さない（直すのはふりかえり画面）。 -->
						<li class="border-l-2 border-border pl-4">
							<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
								<span class="font-mono text-muted-foreground">{row.occurredAt}</span>
								<KindBadge label="気づき" />
								<a
									href={opensReview(
										{ date: i.occurredAt, resultCount: i.resultCount },
										data.today,
										true
									)
										? resolve('/races/[id]', { id: i.raceId })
										: resolve('/races/[id]/preview', { id: i.raceId })}
									class="hover:underline"
								>
									{[raceLabel(i), i.finishPosition ? `${i.finishPosition}着` : null]
										.filter(Boolean)
										.join(' ') || 'レース'}
								</a>
								{@render ageAt(i.occurredAt)}
							</div>
							<InsightView
								words={i.words.map((word) => ({ word }))}
								memo={i.memo}
								label={false}
								class="mt-1"
							/>
						</li>
					{:else}
						{@const n = row.note}
						{@const h = noteHeading(n)}
						<li class="border-l-2 border-gray-200 pl-4">
							<div class="flex items-start gap-2 text-sm">
								<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
									<span class="font-mono text-gray-500">{n.occurredAt}</span>
									<KindBadge label={h.kindLabel} />
									{#if n.raceId}
										<!-- レース紐付きのメモは occurred_at がレース日なので、それと結果の有無で振り分けられる。
									     ふりかえりのメモは、それが書いてあるふりかえりへ。 -->
										<a
											href={opensReview(
												{ date: n.occurredAt, resultCount: n.resultCount },
												data.today,
												isReviewNote(n.kind)
											)
												? resolve('/races/[id]', { id: n.raceId })
												: resolve('/races/[id]/preview', { id: n.raceId })}
											class="hover:underline"
										>
											{h.label}
										</a>
										{@render ageAt(n.occurredAt)}
									{:else}
										<span class="text-gray-500">{h.label}</span>
									{/if}
									<SharedBadge visibility={n.visibility} />
								</div>
								<!-- 共有と削除は読み返すあいだには使わない操作なので畳む。
								     削除が出しっぱなしだと押し間違いの的にもなる。 -->
								<div class="shrink-0">
									<NoteMenu>
										<ShareControl
											noteId={n.id}
											visibility={n.visibility}
											redirectTo="/horses/{data.horse.id}"
										/>
										{#if n.kind === 'horse'}
											<details class="mt-2 border-t pt-2">
												<summary class="cursor-pointer text-xs text-destructive hover:underline"
													>この近況メモを削除</summary
												>
												<p class="mt-2 text-sm">この近況メモを削除すると、元に戻せません。</p>
												<form
													method="POST"
													action="?/deleteNote"
													class="mt-2"
													use:enhance={({ cancel }) => {
														if (deletePending) {
															cancel();
															return;
														}
														deletePending = true;
														return async ({ result, update }) => {
															try {
																await update({ reset: false });
																if (result.type === 'success') {
																	toast.success('近況メモを削除しました');
																	await tick();
																	document.getElementById('horse-timeline')?.focus();
																}
															} finally {
																deletePending = false;
															}
														};
													}}
												>
													<input type="hidden" name="noteId" value={n.id} />
													<Button
														variant="destructive"
														size="sm"
														type="submit"
														aria-disabled={deletePending}>削除する</Button
													>
												</form>
											</details>
										{/if}
									</NoteMenu>
								</div>
							</div>

							{#if n.body}
								<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
							{/if}

							<TagBadges tags={n.tags} class="mt-1" />
						</li>
					{/if}
				{/each}
			</ol>
		{/if}
	</section>
</main>
