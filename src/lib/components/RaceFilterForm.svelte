<script lang="ts">
	import { resolve } from '$app/paths';
	import { GRADES } from '$lib/schemas/race';
	import { ALL_RACES_QUERY, hasRaceFilter, type RaceFilter } from '$lib/utils/race-filter';

	/**
	 * レース一覧の絞り込み。年度・ランク（OR）・レース名（部分一致）。
	 *
	 * **GET フォーム1枚。** 条件がそのまま URL に出るので、絞った状態を
	 * ブックマークにも共有にも使えるし、JS が無くても動く。
	 * 送信された値は必ずサーバー側の `parseRaceFilter` を通る。
	 * ここで組む選択肢は入力の補助であって、絞り込みの担保ではない。
	 *
	 * 何も付けずに開くと今年の重賞に絞ってある（→ `defaultRaceFilter`）。
	 * その状態もフォームにそのまま映るので、何で絞られているかは見れば分かる。
	 */
	let { filter, years }: { filter: RaceFilter; years: number[] } = $props();

	const filtered = $derived(hasRaceFilter(filter));
</script>

<form
	method="GET"
	action={resolve('/races')}
	class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4"
>
	<div class="flex flex-wrap items-end gap-x-4 gap-y-3">
		<div class="flex flex-col gap-1">
			<label for="filter-year" class="text-xs font-medium text-gray-600">年度</label>
			<select
				id="filter-year"
				name="year"
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
			>
				<option value="" selected={filter.year === null}>すべて</option>
				{#each years as year (year)}
					<option value={year} selected={filter.year === year}>{year}年</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-xs font-medium text-gray-600">ランク</span>
			<!-- チェックした格付けの OR。1つも選ばなければ絞らない。 -->
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
				{#each GRADES as grade (grade)}
					<label class="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							name="grade"
							value={grade}
							checked={filter.grades.includes(grade)}
							class="size-4 rounded border-gray-300"
						/>
						{grade}
					</label>
				{/each}
			</div>
		</div>

		<div class="flex min-w-48 flex-1 flex-col gap-1">
			<label for="filter-q" class="text-xs font-medium text-gray-600">レース名</label>
			<input
				id="filter-q"
				name="q"
				value={filter.q}
				placeholder="レース名で検索（部分一致）"
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
			/>
		</div>

		<div class="flex items-center gap-3 py-0.5">
			<button
				type="submit"
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100"
			>
				絞り込む
			</button>
			{#if filtered}
				<!-- `/races` だけだと既定（今年の重賞）に戻るので、全件のクエリを付ける。 -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、クエリを足しているだけ（frontend.md 第3章） -->
				<a
					href={`${resolve('/races')}${ALL_RACES_QUERY}`}
					class="text-sm text-gray-600 hover:underline"
				>
					条件をクリア
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</div>
</form>
