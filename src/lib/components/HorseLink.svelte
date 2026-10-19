<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { onMount } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import type { TrainingCenter } from '$lib/schemas/horse';
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
	 * 生年月日・性齢・馬主は出さない（性齢は行の札にもうある。馬主はアプリのどこにも出していない）。
	 */
	let {
		horseId,
		name,
		profile,
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

	// SSR と hydration の最初の描画は `<a>` のまま。mounted になってから Popover の button に替える。
	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

{#if hasProfile && mounted}
	<Popover.Root>
		<Popover.Trigger class="{className} cursor-pointer text-left">
			<span class="min-w-0 truncate">{name}</span>
		</Popover.Trigger>
		<Popover.Content
			role="dialog"
			aria-label="{name}の基本情報"
			collisionPadding={8}
			class="w-auto max-w-sm items-start gap-1.5"
		>
			<HorseProfileBadges
				sire={profile.sire}
				dam={profile.dam}
				damSire={profile.damSire}
				trainer={profile.trainer}
				trainingCenter={profile.trainingCenter}
			/>
			<a
				{href}
				class="inline-flex min-h-6 items-center gap-0.5 font-medium underline underline-offset-2"
			>
				馬の画面へ<ChevronRightIcon class="size-4" aria-hidden="true" />
			</a>
		</Popover.Content>
	</Popover.Root>
{:else}
	<a {href} class={className}><span class="min-w-0 truncate">{name}</span></a>
{/if}
