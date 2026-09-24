<script lang="ts">
	import { resolve } from '$app/paths';
	import { ALL_RACES_QUERY } from '$lib/utils/race-filter';

	/**
	 * レース一覧が0件のときの文。
	 *
	 * **既定（今年の重賞）で絞ったまま0件なら「条件に合う」と言わない。** 本人は条件を
	 * 付けていないので、何で絞っているかと、全件の見方を出す（→ `defaultRaceFilter`）。
	 */
	let {
		defaultFilter,
		filtered,
		admin
	}: {
		/** 絞り込みのキーが URL に1つも無く、既定で絞った（→ `usesDefaultRaceFilter`）。 */
		defaultFilter: boolean;
		/** 何か1つでも絞っている（→ `hasRaceFilter`）。 */
		filtered: boolean;
		admin: boolean;
	} = $props();
</script>

{#if defaultFilter}
	<div class="mt-8 text-sm text-gray-500">
		<p>
			今年の重賞はまだありません。{#if admin}まずは1つ登録してみてください。{/if}
		</p>
		<p class="mt-2">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、クエリを足しているだけ（frontend.md 第3章） -->
			<a href={`${resolve('/races')}${ALL_RACES_QUERY}`} class="text-gray-600 hover:underline">
				すべてのレースを見る →
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</p>
	</div>
{:else}
	<p class="mt-8 text-sm text-gray-500">
		{#if filtered}
			条件に合うレースがありません。
		{:else if admin}
			まだレースがありません。まずは1つ登録してみてください。
		{:else}
			まだレースがありません。
		{/if}
	</p>
{/if}
