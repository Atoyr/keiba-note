<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import { onMount } from 'svelte';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import type { TrainingCenter } from '#lib/schemas/horse.ts';
	import HorseProfileBadges from './HorseProfileBadges.svelte';

	/**
	 * 出走馬の行の馬名。馬の画面へのリンクで、基本情報（父・母・母父・所属・調教師）が1つでもあれば、
	 * 押す（クリック・タップ）と Popover でその札を開く。**端末では分けない**（マウスでもタッチでも同じ）。
	 * 出走馬を見比べているときに、血統や厩舎を見るためだけに馬の画面へ移らなくて済むようにする。
	 *
	 * **hover で浮かぶ Tooltip にはしない。** 読んでいる途中でマウスが外れると消えるうえ、Tooltip の中にはリンクを置けない。
	 * Popover なら押して開き、外を押すか Esc まで残り、「馬の画面へ」のリンクを中に置ける（理由は `JockeyLink` と同じ）。
	 * 馬の画面へは Popover の中のリンクで行く（名前を押して開くものはリンクではないので button にし、
	 * 読み上げも「ボタン・ポップアップあり」になる）。
	 *
	 * hydration 前（SSR と最初の描画）は `<a>` のまま。JS が無い・読み込み前でも馬の画面へ行ける。
	 *
	 * **基本情報が1つも無い（すべて null）ときは今までどおりのただのリンク**で、Popover で包まない
	 * （空の枠や「まだありません」は出さない。毎回1回多く押させない）。
	 *
	 * **自分の特徴メモ（`trait`）があるときも Popover を開く**（基本情報が無い馬でも）。中身は特徴メモ → 基本情報の札 → 「馬の画面へ」の順。
	 * 特徴メモがあるときは、馬名の右に notebook-pen のアイコンを出す（一覧で有無をひと目で分かるようにする。騎手名と同じ）。
	 * アイコンは `aria-hidden` にし、読み上げには `sr-only` で「（特徴メモあり）」を名前に添える。SSR のリンクにも出す。
	 * 特徴メモは本人だけのもの。`horse.profileMemo`（admin が書く共通マスタ）とは別物。
	 *
	 * 生年月日・性齢・馬主は出さない（性齢は行の札にもうある。馬主はアプリのどこにも出していない）。
	 */
	let {
		horseId,
		name,
		profile,
		trait = null,
		class: className = ''
	}: {
		horseId: string;
		name: string;
		profile: {
			sire: string | null;
			dam: string | null;
			damSire: string | null;
			trainer: string | null;
			trainingCenter: TrainingCenter | null;
		};
		/** viewer 自身の特徴メモの本文。無ければ null。 */
		trait?: string | null;
		/**
		 * `<a>`（hydration 後の基本情報ありでは `<button>`）に付ける。出す画面ごとに幅の取り方が違う。
		 * 名前は中の span で切る（button 自体の truncate は効かないことがある）ので、`flex` か `inline-flex` にする。
		 */
		class?: string;
	} = $props();

	const href = $derived(resolve('/horses/[id]', { id: horseId }));
	const hasProfile = $derived(
		Boolean(
			profile.sire || profile.dam || profile.damSire || profile.trainer || profile.trainingCenter
		)
	);

	const traitBody = $derived(trait?.trim() ?? '');
	const hasTrait = $derived(traitBody !== '');
	const label = $derived(
		hasTrait && hasProfile
			? `${name}の特徴メモと基本情報`
			: hasTrait
				? `${name}の特徴メモ`
				: `${name}の基本情報`
	);

	// SSR と hydration の最初の描画は `<a>` のまま。mounted になってから Popover の button に替える。
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

<!-- 名前だけを truncate する。アイコンを同じ要素で切ると、狭い幅で省略記号の向こうに隠れて特徴メモの有無が分からなくなる。
     呼ぶ側の class は flex か inline-flex（items-center）にする。 -->
{#snippet nameLabel()}
	<span class="min-w-0 truncate">{name}</span>
	{#if hasTrait}
		<NotebookPenIcon class="ml-0.5 size-3.5 shrink-0" aria-hidden="true" />
		<span class="sr-only">（特徴メモあり）</span>
	{/if}
{/snippet}

{#if (hasProfile || hasTrait) && mounted}
	<Popover.Root>
		<Popover.Trigger class="{className} cursor-pointer text-left">
			{@render nameLabel()}
		</Popover.Trigger>
		<!-- 枠の幅は、390px では20rem（max-w-xs）で収め、sm 以上は今までどおり24rem（max-w-sm）。
		     長い特徴メモの本文で広がっても、画面の幅から collisionPadding（8pxずつ）を引いた中に入る。 -->
		<Popover.Content
			role="dialog"
			aria-label={label}
			collisionPadding={8}
			class="w-auto max-w-xs items-start gap-1.5 sm:max-w-sm"
		>
			{#if hasTrait}
				<div class="grid gap-0.5">
					<p class="text-xs font-semibold text-muted-foreground">特徴メモ</p>
					<!-- スクロールできる領域は、キーボードでもフォーカスしてスクロールできるようにする（Safari は既定でフォーカスできない）。 -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<p
						tabindex="0"
						class="max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-ring"
					>
						{traitBody}
					</p>
				</div>
			{/if}
			{#if hasProfile}
				<HorseProfileBadges
					sire={profile.sire}
					dam={profile.dam}
					damSire={profile.damSire}
					trainer={profile.trainer}
					trainingCenter={profile.trainingCenter}
				/>
			{/if}
			<a
				{href}
				class="inline-flex min-h-6 items-center gap-0.5 font-medium underline underline-offset-2"
			>
				馬の画面へ<ChevronRightIcon class="size-4" aria-hidden="true" />
			</a>
		</Popover.Content>
	</Popover.Root>
{:else}
	<a {href} class={className}>{@render nameLabel()}</a>
{/if}
